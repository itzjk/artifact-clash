#!/usr/bin/env node
import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { analyze, invalidReport, LIMITS } from '../src/analyze.js';
import { formatHuman } from '../src/format.js';

const help = `artifact-clash 0.1.0
Preview planned upload names in one local GitHub Actions workflow.

Usage: artifact-clash check <workflow.yml> [--json]
       artifact-clash --help
       artifact-clash --version

Exit codes: 0 complete subset, no shared names (or empty inventory)
            1 shared-name candidates found
            2 incomplete analysis, including any known candidates
            3 invalid input or invocation
`;
const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h', '--version'].includes(args[0])) {
  process.stdout.write(args[0] === '--version' ? '0.1.0\n' : help);
} else {
  const json = args.includes('--json');
  const positional = args.filter(arg => arg !== '--json');
  let report;
  if (positional.length !== 2 || positional[0] !== 'check' || positional[1].startsWith('-') || args.filter(arg => arg === '--json').length > 1) {
    report = invalidReport(null, 'Expected: artifact-clash check <workflow.yml> [--json]');
  } else {
    const file = positional[1];
    let fd;
    try {
      fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new Error('Expected a regular workflow file.');
      if (stat.size > LIMITS.bytes) throw new Error(`Input exceeds ${LIMITS.bytes} bytes.`);
      const buffer = Buffer.alloc(LIMITS.bytes + 1);
      let length = 0;
      let read;
      while (length < buffer.length && (read = readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += read;
      if (length > LIMITS.bytes) throw new Error(`Input exceeds ${LIMITS.bytes} bytes.`);
      const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
      report = analyze(source, file);
    } catch (error) {
      report = invalidReport(file, error.message);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatHuman(report));
  process.exitCode = report.exitCode;
}
