const quote = value => JSON.stringify(value);
const matrixLabel = producer => producer.matrix === null ? 'unresolved' : Object.entries(producer.matrix).map(([k, v]) => `${k}=${quote(v)}`).join(', ') || '-';

export function formatHuman(report) {
  const lines = [`artifact-clash: ${quote(report.file)}`, ''];
  if (report.status === 'invalid-input') {
    for (const d of report.coverage.diagnostics) lines.push(`Invalid input at ${d.location.line}:${d.location.column}: ${quote(d.message)}`);
    return `${lines.join('\n')}\n`;
  }
  lines.push('NAME | JOB | STEP | LINE:COL | MATRIX | OVERWRITE');
  for (const p of report.producers) lines.push(`${p.name === null ? '<unresolved>' : quote(p.name)} | ${quote(p.job)} | ${p.stepIndex} | ${p.location.line}:${p.location.column} | ${matrixLabel(p)} | ${p.overwrite}`);
  if (!report.producers.length) lines.push('Empty upload inventory.');
  lines.push('', `${report.groups.length} shared-name group(s)`);
  for (const group of report.groups) {
    lines.push(`${group.kind}: ${quote(group.name)}`);
    for (const p of group.members) lines.push(`  ${p.id}: job=${quote(p.job)} step=${p.stepIndex} line=${p.location.line}:${p.location.column} matrix#${p.matrixIndex ?? '?'} [${matrixLabel(p)}] overwrite=${p.overwrite}`);
  }
  lines.push('', `Coverage: ${report.coverage.complete ? 'complete within supported subset' : 'incomplete'}; ${report.coverage.resolvedProducers} resolved, ${report.coverage.unresolvedProducers} unresolved producer(s).`);
  for (const d of report.coverage.diagnostics) lines.push(`  ${d.code} at ${d.location.line}:${d.location.column}${d.job === null ? '' : ` job=${quote(d.job)}`}${d.stepIndex === null ? '' : ` step=${d.stepIndex}`}: ${quote(d.message)}`);
  if (!report.groups.length && report.coverage.complete && report.producers.length) lines.push('No shared names in the supported subset.');
  if (!report.coverage.complete) lines.push('No global absence of shared names can be concluded.');
  lines.push('Candidates depend on execution and files. Overwrite can delete results.', 'Comparison: exact names; direct upload steps only.');
  return `${lines.join('\n')}\n`;
}
