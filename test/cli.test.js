import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { analyze, LIMITS } from '../src/analyze.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'bin/artifact-clash.js');
const fixture = name => join(root, 'test/fixtures', `${name}.yml`);
const read = name => readFileSync(fixture(name), 'utf8');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function run(name, options = {}) {
  const result = spawnSync(process.execPath, [cli, 'check', fixture(name), '--json'], { encoding: 'utf8', timeout: 10_000, ...options });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.exitCode, result.status);
  assert.equal(report.schemaVersion, 1);
  return report;
}
const reference = JSON.parse(readFileSync(new URL('./reference.json', import.meta.url), 'utf8'));

for (const variant of ['constant', 'os-only', 'unique']) {
  test(`CLI expands ${variant} with exact groups, order and provenance`, () => {
    const report = run(variant);
    const expected = reference[variant];
    assert.equal(report.exitCode, variant === 'unique' ? 0 : 1);
    assert.equal(report.coverage.complete, true);
    assert.equal(report.producers.length, 4);
    assert.deepEqual(report.producers.map(p => p.name), expected.names);
    assert.deepEqual(report.producers.map(p => p.matrix), expected.matrix);
    assert.deepEqual(report.producers.map(p => p.id), ['p1', 'p2', 'p3', 'p4']);
    for (const [i, producer] of report.producers.entries()) {
      assert.equal(producer.job, 'build');
      assert.equal(producer.stepIndex, 1);
      assert.equal(producer.matrixIndex, i + 1);
      assert.deepEqual(producer.location, { line: 13, column: 15 });
      assert.deepEqual(producer.nameLocation, { line: 15, column: 17 });
    }
    assert.deepEqual(report.groups.map(g => ({ name: g.name, matrixIndices: g.members.map(p => p.matrixIndex) })), expected.groups);
    for (const group of report.groups) {
      assert.equal(group.kind, 'shared-name-candidate');
      assert.deepEqual(group.members, report.producers.filter(p => p.name === group.name));
    }
  });
}

test('independent combinatorial reference is reproducible', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['test/reference.py'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), reference);
});

test('omitted name uses artifact for every instance', () => {
  const r = run('default');
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.producers.map(p => p.name), Array(4).fill('artifact'));
  assert.deepEqual(r.groups[0].members.map(p => p.matrixIndex), [1, 2, 3, 4]);
});

test('two separate jobs share a group with both exact sources', () => {
  const r = run('two-jobs');
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0].members.map(p => [p.job, p.stepIndex, p.location, p.matrix]), [
    ['linux', 1, { line: 6, column: 15 }, {}], ['windows', 1, { line: 13, column: 15 }, {}],
  ]);
});

test('two steps of one job retain original one-based step indices', () => {
  const r = run('two-steps');
  assert.equal(r.groups[0].name, 'artifact');
  assert.deepEqual(r.groups[0].members.map(p => [p.job, p.stepIndex, p.location]), [
    ['build', 2, { line: 7, column: 15 }], ['build', 3, { line: 10, column: 15 }],
  ]);
});

test('one axis is complete when it distinguishes all combinations', () => {
  const r = run('one-axis');
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.producers.map(p => p.matrix), [{ os: 'ubuntu-latest' }, { os: 'windows-latest' }]);
  assert.deepEqual(r.groups, []);
});

test('repeated values remain distinct producer instances', () => {
  const r = run('repeated');
  assert.equal(r.producers.length, 4);
  assert.deepEqual(r.groups.map(g => g.members.map(p => p.matrixIndex)), [[1, 2], [3, 4]]);
  assert.deepEqual(r.groups[0].members[0].matrix, r.groups[0].members[1].matrix);
  assert.notEqual(r.groups[0].members[0].id, r.groups[0].members[1].id);
});

test('overwrite is visible on groups and every member', () => {
  const r = run('overwrite');
  assert.equal(r.exitCode, 1);
  assert.ok(r.groups.every(g => g.kind === 'shared-name-with-overwrite' && g.members.every(p => p.overwrite === true)));
});

for (const [name, code, resolved] of [
  ['step-if', 'explicit-if', true], ['job-if', 'explicit-if', true],
  ['sha', 'unsupported-action-ref', false], ['version', 'unsupported-action-ref', false],
  ['dynamic', 'unsupported-matrix', false], ['include', 'matrix-modifier', false], ['exclude', 'matrix-modifier', false],
  ['number-axis', 'unsupported-axis', false], ['object-axis', 'unsupported-axis', false],
  ['expression', 'unsupported-expression', false], ['function', 'unsupported-expression', false],
  ['missing-axis', 'unsupported-expression', false], ['empty-name', 'empty-name', false], ['null-name', 'empty-name', false],
  ['v7-no-archive', 'unsupported-archive', false],
]) {
  test(`${name} reports incomplete coverage with located ${code}`, () => {
    const r = run(name);
    assert.equal(r.exitCode, 2);
    assert.equal(r.status, 'incomplete');
    assert.equal(r.coverage.complete, false);
    assert.ok(r.coverage.diagnostics.some(d => d.code === code && d.location.line > 1 && d.location.column > 0));
    assert.ok(r.producers.length > 0);
    assert.ok(r.producers.every(p => resolved ? p.name !== null : p.name === null));
    if (resolved) assert.equal(r.groups.length, 2);
  });
}

test('verified v7 has the same default archive name interpolation', () => {
  const r = run('v7');
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.groups.map(g => g.members.map(p => p.matrixIndex)), [[1, 2], [3, 4]]);
});

test('known groups survive alongside a dynamic job', () => {
  const r = run('partial');
  assert.equal(r.exitCode, 2);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0].members.map(p => p.job), ['linux', 'windows']);
  assert.equal(r.producers[2].job, 'dynamic');
  assert.equal(r.producers[2].matrix, null);
  assert.equal(r.producers[2].name, null);
});

test('reusable workflow call cannot receive a global clean result', () => {
  const r = run('reusable');
  assert.equal(r.exitCode, 2);
  assert.equal(r.coverage.diagnostics[0].code, 'reusable-workflow');
});

test('no uploads produces an explicit empty inventory', () => {
  const r = run('empty');
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.producers, []);
  const human = spawnSync(process.execPath, [cli, 'check', fixture('empty')], { encoding: 'utf8' });
  assert.match(human.stdout, /Empty upload inventory/);
  assert.doesNotMatch(human.stdout, /No shared names/);
});

for (const name of ['invalid', 'duplicate', 'aliases']) {
  test(`${name} is invalid input, not a clean result`, () => {
    const r = run(name);
    assert.equal(r.exitCode, 3);
    assert.equal(r.status, 'invalid-input');
    assert.ok(r.coverage.diagnostics[0].location.line > 0);
  });
}

test('human output lists every partial group member and location', () => {
  const r = spawnSync(process.execPath, [cli, 'check', fixture('partial')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /shared-name-candidate: "bundle"/);
  assert.match(r.stdout, /job="linux" step=1 line=6:15/);
  assert.match(r.stdout, /job="windows" step=1 line=13:15/);
  assert.match(r.stdout, /No global absence/);
  assert.doesNotMatch(r.stdout, /No shared names in/);
});

test('workflow hashes stay intact for every checked fixture', () => {
  for (const entry of readdirSync(join(root, 'test/fixtures'))) {
    const path = join(root, 'test/fixtures', entry);
    const before = hash(path);
    run(entry.replace('.yml', ''));
    assert.equal(hash(path), before, entry);
  }
});

test('scripts and local actions are never executed and no files are created', () => {
  const dir = mkdtempSync(join(tmpdir(), 'artifact-clash-'));
  try {
    const source = read('two-steps').replace('echo build', 'node bait.cjs').replace('      - uses: actions/upload-artifact@v7', '      - uses: ./bait\n      - uses: actions/upload-artifact@v7');
    writeFileSync(join(dir, 'workflow.yml'), source);
    writeFileSync(join(dir, 'bait.cjs'), "require('node:fs').writeFileSync('EXECUTED', 'bad')");
    const before = hash(join(dir, 'workflow.yml'));
    const result = spawnSync(process.execPath, [cli, 'check', 'workflow.yml', '--json'], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 1);
    assert.equal(existsSync(join(dir, 'EXECUTED')), false);
    assert.equal(hash(join(dir, 'workflow.yml')), before);
    assert.deepEqual(readdirSync(dir).sort(), ['bait.cjs', 'workflow.yml']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI makes no network or subprocess calls with active API guards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'artifact-clash-'));
  try {
    const guard = join(dir, 'guard.mjs');
    writeFileSync(guard, `import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import child from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const block = () => { throw new Error('BLOCKED_SIDE_EFFECT'); };
globalThis.fetch = block;
for (const mod of [http, https]) { mod.request = block; mod.get = block; }
for (const method of ['connect', 'createConnection']) net[method] = block;
net.Socket.prototype.connect = block;
tls.connect = block;
dns.lookup = block;
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) child[method] = block;
syncBuiltinESMExports();
`);
    const guardUrl = pathToFileURL(guard).href;
    const control = spawnSync(process.execPath, ['--import', guardUrl, '-e', 'fetch("https://example.invalid")'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(control.status, 1);
    assert.match(control.stderr, /BLOCKED_SIDE_EFFECT/);
    for (const name of ['constant', 'unique', 'partial', 'invalid']) {
      const r = spawnSync(process.execPath, ['--import', guardUrl, cli, 'check', fixture(name), '--json'], { encoding: 'utf8', timeout: 10_000 });
      assert.equal(r.status, { constant: 1, unique: 0, partial: 2, invalid: 3 }[name]);
      assert.equal(r.stderr, '');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI rejects oversized files, directories and invalid UTF-8', () => {
  const dir = mkdtempSync(join(tmpdir(), 'artifact-clash-'));
  try {
    for (const [name, data] of [['large', Buffer.alloc(LIMITS.bytes + 1, 32)], ['utf8', Buffer.from([0xff])]]) {
      const path = join(dir, name);
      writeFileSync(path, data);
      const r = spawnSync(process.execPath, [cli, 'check', path, '--json'], { encoding: 'utf8', timeout: 10_000 });
      assert.equal(r.status, 3);
      assert.equal(JSON.parse(r.stdout).coverage.complete, false);
    }
    const r = spawnSync(process.execPath, [cli, 'check', dir], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const args of [[], ['check'], ['oops', 'x'], ['check', 'absent.yml'], ['check', 'x', '--bogus'], ['check', 'x', '--json', '--json']]) {
  test(`invalid CLI invocation ${JSON.stringify(args)}`, () => {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 3);
    if (args.includes('--json')) assert.equal(JSON.parse(r.stdout).status, 'invalid-input');
    else assert.match(r.stdout, /Invalid input/);
    assert.equal(r.stderr, '');
  });
}

test('help and version work outside the repository', () => {
  for (const option of ['--help', '-h', '--version']) {
    const r = spawnSync(process.execPath, [cli, option], { cwd: tmpdir(), encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /0\.1\.0/);
  }
});
