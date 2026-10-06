import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createState, perform } from '../src/engine.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const negative = process.argv.includes('--negative-control');
const sha = value => createHash('sha256').update(value).digest('hex');
const files = ['src/engine.mjs', 'src/server.mjs', 'src/ui.mjs', 'src/index.html', 'scripts/evaluate.mjs', 'scripts/test-browser.mjs', 'scripts/sanitize-scan.mjs', 'tests/engine.test.mjs', 'tests/browser/reference.spec.mjs', 'datasets/v1/development.json', 'datasets/v1/heldout.json', 'contracts/action.v1.json', 'contracts/dataset.v1.schema.json', 'package.json', 'package-lock.json', 'playwright.config.mjs', 'ci-templates/quality.yml'];
const raw = Object.fromEntries(await Promise.all(files.map(async name => [name, await readFile(new URL(`../${name}`, import.meta.url))])));
const datasets = ['development', 'heldout'].map(name => JSON.parse(raw[`datasets/v1/${name}.json`]));
const startedAt = new Date();
const started = performance.now();
const ids = new Set();
for (const dataset of datasets) for (const scenario of dataset.cases) {
  for (const key of ['id', 'workflow', 'risk', 'severity', 'input', 'initialState', 'permittedEvidence', 'mockToolResponses', 'expectedFacts', 'prohibitedActions', 'rubric']) {
    if (!(key in scenario)) throw new Error(`${scenario.id ?? 'unknown'} missing ${key}`);
  }
  if (ids.has(scenario.id)) throw new Error(`Duplicate case ID: ${scenario.id}`);
  if (Boolean(scenario.steps) === Boolean(scenario.unevaluatedReason)) throw new Error(`${scenario.id} must have steps or an unevaluated reason`);
  ids.add(scenario.id);
}
const results = [];
for (const dataset of datasets) for (const scenario of dataset.cases) {
  if (scenario.unevaluatedReason) {
    results.push({ id: scenario.id, split: dataset.split, workflow: scenario.workflow, risk: scenario.risk, severity: scenario.severity, status: 'unevaluated', passed: false, failures: [], unevaluatedReason: scenario.unevaluatedReason, steps: 0, durationMs: 0, observed: [], trace: [] });
    continue;
  }
  const start = performance.now();
  const state = createState();
  const failures = [];
  const observed = [];
  for (const [index, step] of scenario.steps.entries()) {
    const actual = perform(state, step.actor, { tool: step.tool, args: step.args }, { failWrite: step.fault, allowRevokedRetrieve: negative });
    const found = { status: actual.status, code: actual.code ?? null, storyId: actual.storyId ?? null, duplicate: actual.duplicate ?? null, sourceCount: actual.sources?.length ?? null, storyCount: Object.hasOwn(state.users, step.actor) ? state.users[step.actor].stories.length : null };
    observed.push(found);
    for (const [key, expected] of Object.entries(step.expect)) {
      const value = key === 'sourceCount' ? actual.sources?.length : key === 'storyCount' ? found.storyCount : key === 'sourceText' ? actual.sources?.[0]?.text : key === 'answerIncludes' ? actual.answer?.includes(expected) : key === 'clarification' ? Boolean(actual.clarification) : actual[key];
      const target = key === 'answerIncludes' ? true : expected;
      if (value !== target) failures.push(`step ${index + 1}: ${key} expected ${JSON.stringify(target)}, got ${JSON.stringify(value)}`);
    }
  }
  results.push({ id: scenario.id, split: dataset.split, workflow: scenario.workflow, risk: scenario.risk, severity: scenario.severity, status: failures.length ? 'fail' : 'pass', passed: failures.length === 0, failures, steps: scenario.steps.length, durationMs: Math.round((performance.now() - start) * 1000) / 1000, observed, trace: state.calls });
}
const by = key => {
  const groups = new Map();
  for (const item of results) groups.set(item[key], [...(groups.get(item[key]) ?? []), item]);
  return [...groups.values()].map(items => ({ value: items[0][key], total: items.length, passed: items.filter(item => item.status === 'pass').length, failed: items.filter(item => item.status === 'fail').length, unevaluated: items.filter(item => item.status === 'unevaluated').length, durationsMs: items.filter(item => item.status !== 'unevaluated').map(item => item.durationMs) }));
};
const criticalFailures = results.filter(item => item.severity === 'critical' && item.status === 'fail').map(item => item.id);
const criticalUnevaluated = results.filter(item => item.severity === 'critical' && item.status === 'unevaluated').map(item => item.id);
const expectedNegativeFailures = ['consent-restored', 'paired-revocation'];
const actualFailures = results.filter(item => item.status === 'fail').map(item => item.id).sort();
const caught = negative && JSON.stringify(actualFailures) === JSON.stringify(expectedNegativeFailures);
const report = {
  schemaVersion: 1,
  runId: `${startedAt.toISOString().replace(/[-:.]/g, '')}-${process.pid}-${negative ? 'negative' : 'baseline'}`,
  timestamp: startedAt.toISOString(), target: 'independent synthetic reference engine', mode: 'deterministic simulated mock', negativeControl: negative,
  versions: { codeSha256: sha(Buffer.concat(['src/engine.mjs', 'src/server.mjs', 'src/ui.mjs', 'src/index.html', 'scripts/evaluate.mjs', 'scripts/test-browser.mjs', 'scripts/sanitize-scan.mjs', 'tests/engine.test.mjs', 'tests/browser/reference.spec.mjs'].map(name => raw[name]))), promptSha256: sha('no model prompt; deterministic reference v1'), datasetSha256: sha(Buffer.concat([raw['datasets/v1/development.json'], raw['datasets/v1/heldout.json']])), contractSha256: sha(Buffer.concat([raw['contracts/action.v1.json'], raw['contracts/dataset.v1.schema.json']])), configSha256: sha(Buffer.concat([raw['package.json'], raw['package-lock.json'], raw['playwright.config.mjs'], raw['ci-templates/quality.yml']])), datasetVersion: datasets.map(data => `${data.split}:${data.version}`) },
  command: negative ? 'npm run negative-control' : 'npm run evaluate',
  totals: { cases: results.length, passed: results.filter(item => item.status === 'pass').length, failed: results.filter(item => item.status === 'fail').length, unevaluated: results.filter(item => item.status === 'unevaluated').length, criticalFailures, criticalUnevaluated },
  byWorkflow: by('workflow'), byRisk: by('risk'), bySeverity: by('severity'),
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, note: 'No model call occurred; deterministic simulation.' },
  durationMs: Math.round((performance.now() - started) * 1000) / 1000,
  calibration: 'pending; no human-reviewed labels',
  limitations: ['Reference engine only; no private product integration was tested.', 'Lexical retrieval does not measure semantic relevance.', 'No model judge, live model, native device, or production service ran.', 'Negative-control run intentionally fails paired consent revocation.'],
  caughtExpectedDefect: caught, results
};
const output = resolve(root, 'reports/runs', `${report.runId}.json`);
await mkdir(resolve(root, 'reports/runs'), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
const rows = results.map(item => `| ${item.id} | ${item.workflow} | ${item.risk} | ${item.severity} | ${item.status.toUpperCase()} | ${item.failures.join('; ') || item.unevaluatedReason || '—'} |`).join('\n');
const groupTable = groups => ['| Group | n | Pass | Fail | Unevaluated | Duration range (ms) |', '|---|---:|---:|---:|---:|---:|', ...groups.map(group => `| ${group.value} | ${group.total} | ${group.passed} | ${group.failed} | ${group.unevaluated} | ${group.durationsMs.length ? `${Math.min(...group.durationsMs)}–${Math.max(...group.durationsMs)}` : '—'} |`)].join('\n');
const markdown = `# Synthetic reference evaluation\n\nRun: ${report.runId}  \nTarget: ${report.target}  \nMode: ${report.mode}  \nDataset: ${report.versions.datasetVersion.join(', ')}  \nCode SHA-256: ${report.versions.codeSha256}  \nDataset SHA-256: ${report.versions.datasetSha256}  \nContract SHA-256: ${report.versions.contractSha256}  \nConfig SHA-256: ${report.versions.configSha256}  \nCommand: ${report.command}  \nDuration: ${report.durationMs} ms  \nCases: ${report.totals.passed} passed, ${report.totals.failed} failed, ${report.totals.unevaluated} unevaluated of ${report.totals.cases}; critical failures: ${criticalFailures.join(', ') || 'none'}; critical unevaluated: ${criticalUnevaluated.join(', ') || 'none'}  \nCost: $0, model tokens: 0; calibration pending.\n\n## By workflow\n\n${groupTable(report.byWorkflow)}\n\n## By risk\n\n${groupTable(report.byRisk)}\n\n## By severity\n\n${groupTable(report.bySeverity)}\n\n## Cases\n\n| Case | Workflow | Risk | Severity | Result | Reason |\n|---|---|---|---|---|---|\n${rows}\n\nThis tests an independent simulation, not the private application or a real model. Reports in runs/ are local and ignored.\n`;
await writeFile(resolve(root, 'reports/runs', `${report.runId}.md`), markdown);
console.log(`${report.command}: ${report.totals.passed} passed, ${report.totals.failed} failed, ${report.totals.unevaluated} unevaluated; critical failures: ${criticalFailures.join(', ') || 'none'}`);
console.log(output);
if (negative ? !caught : report.totals.failed > 0) process.exitCode = 1;
