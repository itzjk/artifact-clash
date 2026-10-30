import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, LIMITS } from '../src/analyze.js';

const base = readFileSync(new URL('./fixtures/os-only.yml', import.meta.url), 'utf8');
const twoJobs = readFileSync(new URL('./fixtures/two-jobs.yml', import.meta.url), 'utf8');
const code = (source, expected) => {
  const r = analyze(source);
  assert.equal(r.exitCode, 2);
  assert.ok(r.coverage.diagnostics.some(d => d.code === expected), JSON.stringify(r));
  return r;
};

test('axis order follows the YAML mapping, not alphabetic sorting', () => {
  const r = analyze(base.replace("        os: [ubuntu-latest, windows-latest]\n        node: ['20', '22']", "        node: ['20', '22']\n        os: [ubuntu-latest, windows-latest]"));
  assert.deepEqual(r.producers.map(p => Object.keys(p.matrix)), Array(4).fill(['node', 'os']));
  assert.deepEqual(r.groups.map(g => g.members.map(p => p.matrixIndex)), [[1, 3], [2, 4]]);
});

test('mixed overwrite group preserves both input values', () => {
  const r = analyze(twoJobs.replace('          name: bundle', '          overwrite: true\n          name: bundle'));
  assert.equal(r.groups[0].kind, 'shared-name-with-overwrite');
  assert.deepEqual(r.groups[0].members.map(p => p.overwrite), [true, false]);
});

test('unknown overwrite retains known names and candidates', () => {
  const r = code(base.replace('          path:', '          overwrite: ${{ inputs.replace }}\n          path:'), 'unknown-overwrite');
  assert.equal(r.groups.length, 2);
  assert.equal(r.producers[0].overwrite, 'unknown');
});

for (const archive of ['false', '${{ inputs.archive }}', 'anything']) {
  test(`v7 archive=${archive} is unresolved`, () => {
    const r = code(base.replace('@v4', '@v7').replace('          path:', `          archive: ${archive}\n          path:`), 'unsupported-archive');
    assert.ok(r.producers.every(p => p.name === null));
  });
}

for (const template of ['${{ env.ARTIFACT_NAME }}', '${{ matrix.os', '${{ matrix.os }}-${{ github.run_id }}', '${{ matrix["os"] }}']) {
  test(`unsupported expression ${template}`, () => {
    const r = code(base.replace('bundle-${{ matrix.os }}', template), 'unsupported-expression');
    assert.ok(r.producers.every(p => p.name === null));
  });
}

test('literal service equivalence is not assumed', () => {
  const r = analyze(twoJobs.replace('name: bundle', 'name: Bundle'));
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.producers.map(p => p.name), ['Bundle', 'bundle']);
});

test('name controls are escaped in human output', async () => {
  const { formatHuman } = await import('../src/format.js');
  const r = analyze(base.replace('name: bundle-${{ matrix.os }}', 'name: "bundle\\n\\u001b[31m"'));
  const out = formatHuman(r);
  assert.equal(out.includes('\x1b'), false);
  assert.ok(out.includes('bundle\\n\\u001b'));
});

test('combination explosion is bounded before expansion and keeps prior groups', () => {
  const axis = Array.from({ length: 65 }, (_, i) => `'${i}'`).join(', ');
  const r = code(twoJobs + `  big:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        a: [${axis}]\n        b: [${axis}]\n    steps:\n      - uses: actions/upload-artifact@v4\n`, 'combination-limit');
  assert.equal(r.producers.length, 3);
  assert.equal(r.groups.length, 1);
  assert.equal(r.producers[2].matrix, null);
});

test('aggregate workflow combination budget is enforced across jobs', () => {
  const axis = Array.from({ length: 33 }, (_, i) => `'${i}'`).join(', ');
  const job = base.slice(base.indexOf('  build:')).replace("[ubuntu-latest, windows-latest]", `[${axis}]`).replace("['20', '22']", `[${axis}]`);
  const r = code('on: [push]\njobs:\n' + [0, 1, 2, 3].map(i => job.replace('  build:', `  job${i}:`)).join(''), 'combination-limit');
  assert.equal(r.producers.length, 3 * 1089 + 1);
});

test('producer budget bounds repeated uploads and locates omitted expansion', () => {
  const axis = Array.from({ length: 64 }, (_, i) => `'${i}'`).join(', ');
  const source = base.replace('[ubuntu-latest, windows-latest]', `[${axis}]`).replace("['20', '22']", `[${axis}]`);
  const step = source.slice(source.indexOf('      - uses:'));
  const r = code(source + step.repeat(4), 'producer-limit');
  assert.equal(r.producers.length, LIMITS.producers);
  assert.equal(r.coverage.uploadSteps, 5);
});

test('node and nesting limits reject input', () => {
  const nodes = 'extra: [' + Array(LIMITS.nodes).fill('x').join(',') + ']\n' + twoJobs;
  assert.equal(analyze(nodes).exitCode, 3);
  const depth = 'extra: ' + '['.repeat(LIMITS.depth + 2) + 'x' + ']'.repeat(LIMITS.depth + 2) + '\n' + twoJobs;
  const r = analyze(depth);
  assert.equal(r.exitCode, 3);
  assert.match(r.coverage.diagnostics[0].message, /depth/);
});

test('aliases, recursive aliases, merge keys, tags and duplicate jobs are invalid', () => {
  for (const prefix of ['extra: &a [*a]\n', 'extra: {<<: {x: y}}\n', 'extra: !unknown value\n']) assert.equal(analyze(prefix + twoJobs).exitCode, 3);
  const duplicate = twoJobs.replace('  windows:', '  linux:');
  assert.equal(analyze(duplicate).exitCode, 3);
});

for (const source of ['', '[]', 'jobs: {}', 'jobs: {build: null}', 'jobs: {build: {steps: {}}}', 'jobs: {build: {steps: [null]}}', 'jobs: {}\n---\njobs: {}']) {
  test(`invalid workflow structure ${source.slice(0, 35)}`, () => assert.equal(analyze(source).exitCode, 3));
}

test('expression-valued axis never becomes a literal name', () => {
  code(base.replace("['20', '22']", "['${{ inputs.version }}']"), 'unsupported-axis');
});

test('dynamic action reference makes the inventory incomplete', () => {
  code(base.replace('actions/upload-artifact@v4', '${{ inputs.action }}'), 'unknown-action');
});

test('workflow_call trigger is outside the subset', () => {
  for (const trigger of ['workflow_call', '[workflow_call]', '{workflow_call: {}}']) {
    const r = code(base.replace('[push]', trigger), 'reusable-workflow');
    assert.equal(r.groups.length, 2);
  }
});

test('nonliteral with mapping and non-string names stay unresolved', () => {
  const r = code(base.replace('        with:\n          name: bundle-${{ matrix.os }}\n          path: dist/', '        with: ${{ inputs.upload }}'), 'unsupported-inputs');
  assert.ok(r.producers.every(p => p.name === null));
  code(base.replace('name: bundle-${{ matrix.os }}', 'name: 42'), 'unsupported-name');
});

test('empty resolved name gets its own diagnostic', () => {
  const r = code(base.replace('[ubuntu-latest, windows-latest]', "['']").replace('bundle-${{ matrix.os }}', '${{ matrix.os }}'), 'empty-name');
  assert.ok(r.producers.every(p => p.name === null));
});

test('action input trimming cannot create a false clean result', () => {
  const r = code(twoJobs.replace('name: bundle', 'name: "bundle "'), 'name-whitespace');
  assert.deepEqual(r.producers.map(p => p.name), [null, 'bundle']);
  code(base.replace('bundle-${{ matrix.os }}', "'   '"), 'name-whitespace');
});

test('noncanonical action input keys cannot silently use defaults', () => {
  for (const key of ['Name', 'NAME', 'Overwrite', 'Archive']) {
    const source = key.toLowerCase() === 'name' ? twoJobs.replace('name: bundle', `${key}: bundle`) : twoJobs.replace('          name: bundle', `          ${key}: false\n          name: bundle`);
    const r = code(source, 'noncanonical-input');
    assert.equal(r.producers[0].name, null);
  }
  code(twoJobs.replace('          name: bundle', '          Name: other\n          name: bundle'), 'noncanonical-input');
});

test('action tag case is significant', () => {
  code(base.replace('@v4', '@V4'), 'unsupported-action-ref');
});

test('noncanonical upload action paths are recognized but unresolved', () => {
  for (const action of ['actions/upload-artifact/@v4', 'actions//upload-artifact@v4', 'actions\\upload-artifact@v4', 'actions/upload-artifact']) {
    const r = code(base.replace('actions/upload-artifact@v4', JSON.stringify(action)), 'unsupported-action-ref');
    assert.equal(r.coverage.uploadSteps, 1);
    assert.ok(r.producers.every(p => p.name === null));
  }
});

test('matrix cell budget is checked before multiplying wide combinations', () => {
  const axes = Array.from({ length: 100 }, (_, i) => `        k${i}: ['x']\n`).join('');
  const r = code(base.replace("        node: ['20', '22']", axes + "        node: ['20', '22']").replace('[ubuntu-latest, windows-latest]', '[' + Array(1024).fill('os').join(',') + ']'), 'matrix-cell-limit');
  assert.equal(r.producers.length, 1);
  assert.equal(r.producers[0].matrix, null);
});

test('expanded string budget bounds long repeated templates and matrix values', () => {
  const template = 'x'.repeat(100_000);
  const r = code(base.replace('[ubuntu-latest, windows-latest]', '[' + Array(100).fill('os').join(',') + ']').replace('bundle-${{ matrix.os }}', template), 'expanded-size-limit');
  assert.ok(r.producers.length < 100);
  assert.ok(Buffer.byteLength(JSON.stringify(r)) < 3 * LIMITS.expandedBytes);
  const repeatedExpression = '${{ matrix.os }}'.repeat(1000);
  const tooLargeName = code(base.replace('[ubuntu-latest, windows-latest]', `['${'x'.repeat(10_000)}']`).replace('bundle-${{ matrix.os }}', repeatedExpression), 'expanded-size-limit');
  assert.ok(tooLargeName.producers.every(p => p.name === null));
});
