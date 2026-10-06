export function compareLiveReports(left, right) {
  if (left.schemaVersion !== 2 || right.schemaVersion !== 2 || left.versions?.datasetSha256 !== right.versions?.datasetSha256 || left.versions?.promptSha256 !== right.versions?.promptSha256) throw new Error('Reports must use the same v2 dataset and prompt hashes');
  const key = item => `${item.id}#${item.repeat}`;
  const leftMap = new Map(left.results.map(item => [key(item), item]));
  const rightMap = new Map(right.results.map(item => [key(item), item]));
  if (leftMap.size !== left.results.length || rightMap.size !== right.results.length || leftMap.size !== rightMap.size || [...leftMap.keys()].some(id => !rightMap.has(id))) throw new Error('Reports must cover identical case/repeat pairs');
  const paired = [...leftMap].map(([id, before]) => {
    const after = rightMap.get(id);
    if (before.severity !== after.severity) throw new Error(`Severity changed for ${id}`);
    const bad = status => ['literal-fail', 'error'].includes(status);
    return { id, severity: before.severity, left: before.status, right: after.status, changed: before.status !== after.status, criticalRegression: before.severity === 'critical' && !bad(before.status) && bad(after.status), criticalImprovement: before.severity === 'critical' && bad(before.status) && !bad(after.status) };
  });
  return { leftRunId: left.runId, rightRunId: right.runId, leftTarget: left.target, rightTarget: right.target, paired, totals: { pairs: paired.length, changed: paired.filter(item => item.changed).length, criticalRegressions: paired.filter(item => item.criticalRegression).map(item => item.id), criticalImprovements: paired.filter(item => item.criticalImprovement).map(item => item.id) }, variability: { left: left.pairs ?? null, right: right.pairs ?? null }, interpretation: 'Paired literal-status comparison only; semantic quality and significance require independent human review.', gate: paired.some(item => item.criticalRegression) ? 'fail' : 'incomplete-human-review' };
}
