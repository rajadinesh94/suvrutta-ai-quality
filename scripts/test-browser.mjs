import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowedProjects = new Set(['chromium', 'firefox', 'webkit', 'mobile-chromium']);
const selectedProjects = [];
for (let index = 0; index < process.argv.slice(2).length; index += 1) {
  const value = process.argv.slice(2)[index];
  const project = value === '--project' ? process.argv.slice(2)[++index] : value.startsWith('--project=') ? value.slice('--project='.length) : null;
  if (!allowedProjects.has(project)) throw new Error('Only named reference browser projects may be selected.');
  selectedProjects.push(project);
}
const startedAt = new Date();
const started = performance.now();
const runId = `browser-${startedAt.toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
const runDir = resolve(root, 'reports/runs', runId);
await mkdir(runDir, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFiles = async paths => sha(Buffer.concat(await Promise.all(paths.map(path => readFile(new URL(`../${path}`, import.meta.url))))));
const files = {
  code: ['src/engine.mjs', 'src/server.mjs', 'src/ui.mjs', 'src/index.html', 'tests/browser/reference.spec.mjs', 'scripts/test-browser.mjs'],
  dataset: ['datasets/v1/development.json', 'datasets/v1/heldout.json'],
  scenario: ['tests/browser/reference.spec.mjs'],
  config: ['package.json', 'package-lock.json', 'playwright.config.mjs', 'ci-templates/quality.yml']
};
const versions = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, paths]) => [`${name}Sha256`, await hashFiles(paths)])));
versions.promptSha256 = sha('no model prompt; deterministic reference v1');
versions.datasetVersion = (await Promise.all(['development', 'heldout'].map(async split => {
  const dataset = JSON.parse(await readFile(new URL(`../datasets/v1/${split}.json`, import.meta.url), 'utf8'));
  return `${dataset.split}:${dataset.version}`;
}))).join(', ');
const projectArgs = selectedProjects.map(project => `--project=${project}`);
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const child = spawn(process.execPath, [cli, 'test', ...projectArgs], {
  cwd: root,
  env: { ...process.env, QUALITY_RUN_DIR: runDir },
  stdio: 'inherit'
});
const outcome = await new Promise(resolveOutcome => {
  child.once('error', error => resolveOutcome({ exitCode: 1, reason: `Runner could not start: ${error.code ?? error.name}` }));
  child.once('close', (code, signal) => resolveOutcome({ exitCode: code ?? 1, reason: signal ? `Runner interrupted by ${signal}` : code === 0 ? null : `Playwright exited ${code}` }));
});
let stats = null;
let failedTests = [];
try {
  const raw = JSON.parse(await readFile(join(runDir, 'playwright-results.json'), 'utf8'));
  const { expected = 0, unexpected = 0, skipped = 0, flaky = 0, duration = null } = raw.stats ?? {};
  stats = { passed: expected, failed: unexpected, skipped, flaky, runnerDurationMs: duration };
  const visit = suite => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) if (test.status === 'unexpected') {
      const message = test.results?.at(-1)?.errors?.[0]?.message ?? '';
      const reasonType = /browserType\.launch/i.test(message) ? 'browser_launch_blocked' : /timeout/i.test(message) ? 'timeout' : /expect\(/i.test(message) ? 'assertion' : 'runner_error';
      failedTests.push({ caseId: spec.id, title: spec.title, project: test.projectName, reasonType });
    }
    for (const nested of suite.suites ?? []) visit(nested);
  };
  for (const suite of raw.suites ?? []) visit(suite);
} catch { /* Retain the runner failure without inventing a test count. */ }
const report = {
  schemaVersion: 1,
  runId,
  timestamp: startedAt.toISOString(),
  target: 'independent synthetic reference web target',
  mode: 'deterministic simulated mock',
  selectedProjects: selectedProjects.length ? selectedProjects : [...allowedProjects],
  command: ['node', 'scripts/test-browser.mjs', ...projectArgs],
  versions,
  result: outcome.exitCode === 0 && stats?.failed === 0 && stats?.passed > 0 ? 'pass' : 'fail',
  exitCode: outcome.exitCode,
  failureReason: outcome.reason ?? (!stats ? 'Playwright result JSON unavailable' : stats.passed === 0 ? 'No tests executed' : null),
  durationMs: Math.round((performance.now() - started) * 1000) / 1000,
  counts: stats,
  failedTests,
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, note: 'No model call occurred.' },
  artifacts: ['playwright-results.json', 'artifacts/'],
  limitations: ['Reference target only; no private product integration.', 'Fixture actor selector does not authenticate users.', 'Mobile browser emulation is not a native device test.', 'No live model, provider, production service, or human calibration was tested.', 'Raw Playwright results and any traces/screenshots remain local and require content review before sharing.']
};
await writeFile(join(runDir, 'provenance.json'), JSON.stringify(report, null, 2) + '\n');
const failureRows = failedTests.length ? failedTests.map(item => `| ${item.project} | ${item.title} | ${item.reasonType} |`).join('\n') : '| — | — | — |';
await writeFile(join(runDir, 'summary.md'), `# Browser run ${runId}\n\nTarget: ${report.target}  \nMode: ${report.mode}  \nProjects: ${report.selectedProjects.join(', ')}  \nCommand: ${report.command.join(' ')}  \nResult: ${report.result}; exit ${report.exitCode}; ${stats ? `${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped, ${stats.flaky} flaky` : 'counts unavailable'}  \nReason: ${report.failureReason ?? 'none'}  \nDuration: ${report.durationMs} ms  \nCode SHA-256: ${versions.codeSha256}  \nScenario SHA-256: ${versions.scenarioSha256}  \nDataset SHA-256: ${versions.datasetSha256}  \nConfig SHA-256: ${versions.configSha256}  \nCost: $0; model tokens: 0.\n\n| Project | Failed case | Reason type |\n|---|---|---|\n${failureRows}\n\nThis tests an independent simulation only. Local raw artifacts require review before sharing.\n`);
console.log(`Browser provenance: reports/runs/${runId}/provenance.json`);
process.exitCode = report.result === 'pass' ? 0 : 1;
