import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = resolve(root, process.platform === 'win32' ? '.local/eval-venv/Scripts/python.exe' : '.local/eval-venv/bin/python');
try { await access(python); } catch { throw new Error('Install the pinned Python evaluation environment at .local/eval-venv first'); }
const startedAt = new Date();
const runId = `cycle-${startedAt.toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
const dir = join(root, 'reports/runs', runId);
await mkdir(dir, { recursive: true });
const budgets = JSON.parse(await readFile(join(root, 'config/budgets.v1.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
async function hashFiles(names) {
  const hash = createHash('sha256');
  for (const name of names) { hash.update(name); hash.update('\0'); hash.update(await readFile(join(root, name))); hash.update('\0'); }
  return hash.digest('hex');
}
async function captureVersions() {
  const select = prefix => paths.filter(name => name.startsWith(prefix));
  const source = paths.filter(name => /^(quality|src|scripts|tests|nonfunctional)\//.test(name));
  const config = paths.filter(name => /^(\.github|config)\//.test(name) || ['package.json', 'package-lock.json', 'playwright.config.mjs', 'playwright.product.config.mjs', 'tsconfig.json'].includes(name));
  return {
    shareableFileCount: paths.length,
    shareableTreeSha256: await hashFiles(paths),
    codeAndTestsSha256: await hashFiles(source),
    configurationSha256: await hashFiles(config),
    datasetSha256: await hashFiles(select('datasets/')),
    contractSha256: await hashFiles(select('contracts/')),
    budgetSha256: await hashFiles(['config/budgets.v1.json']),
    promptSha256: sha('no model prompt used by deterministic cycle'),
  };
}
const versions = await captureVersions();
const git = (() => {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const changes = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
    return { commit, workingTreeDirty: Boolean(changes), changeCount: changes ? changes.split('\n').length : 0 };
  } catch { return { commit: null, workingTreeDirty: null, changeCount: null }; }
})();
const steps = [];
const safeEnv = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`, QUALITY_EXTERNAL_REFERENCE: '1',
  DEEPEVAL_DISABLE_DOTENV: '1', DEEPEVAL_TELEMETRY_OPT_OUT: '1' };
for (const key of ['LUNA_SERVICE_TOKEN', 'OPENAI_API_KEY', 'CONFIDENT_API_KEY', 'LANGFUSE_SECRET_KEY']) delete safeEnv[key];
delete safeEnv.QUALITY_STAGE_FAULT;
const browserProjects = ['--project=chromium'];
const k6Available = (() => { try { execFileSync('which', ['k6'], { stdio: 'ignore' }); return true; } catch { return false; } })();

async function run(name, command, args, { env = {}, expected = 'pass', marker = 'FAILED tests/test_stage_pipeline.py::test_labeled_retrieval_and_acl[cross-user]' } = {}) {
  const started = Date.now();
  const invocation = [command, ...args];
  const child = spawn(command, args, { cwd: root, env: { ...safeEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const record = bytes => { const chunk = bytes.toString(); process.stdout.write(chunk); if (output.length < 1000000) output += chunk; };
  child.stdout.on('data', record); child.stderr.on('data', record);
  const exitCode = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', code => resolveExit(code ?? 1)); });
  const log = `${name}.log`;
  await writeFile(join(dir, log), output);
  const detected = expected === 'fail' && exitCode !== 0 && output.includes(marker);
  const status = expected === 'fail' ? detected ? 'detected' : 'missed' : exitCode === 0 ? 'pass' : 'fail';
  const step = { name, command: invocation, status, exitCode, durationMs: Date.now() - started, log };
  const browser = output.match(/Browser provenance: (reports\/runs\/[^\s]+\/provenance\.json)/);
  if (browser) step.browserProvenance = browser[1];
  steps.push(step);
  return step;
}

let server;
try {
  let portOccupied = false;
  try { await fetch('http://127.0.0.1:4175/health', { signal: AbortSignal.timeout(500) }); portOccupied = true; } catch { /* No HTTP listener answered. */ }
  if (portOccupied) throw new Error('Loopback port 4175 is already serving another process; stop it before this owned reference cycle');
  server = spawn(process.execPath, ['src/server.mjs'], { cwd: root, env: { ...safeEnv, PORT: '4175' }, stdio: 'ignore' });
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch('http://127.0.0.1:4175/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).target === 'reference') { healthy = true; break; }
    } catch { /* Wait for the child to listen. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  if (!healthy) throw new Error('The owned synthetic reference server did not become healthy on loopback 4175');
  await run('typecheck', 'npm', ['run', 'typecheck']);
  await run('node-baseline', 'npm', ['test']);
  await run('python-baseline', python, ['-m', 'pytest', '-q', 'tests/test_deepeval_suite.py', 'tests/test_stage_pipeline.py', 'tests/test_outcome_controls.py', 'tests/test_reference_api.py', `--junitxml=${join(dir, 'python-baseline.xml')}`]);
  await run('reference-baseline', 'npm', ['run', 'evaluate']);
  await run('browser-baseline', 'npm', ['run', 'test:e2e', '--', ...browserProjects]);
  await run('controlled-acl-fault', python, ['-m', 'pytest', '-q', 'tests/test_stage_pipeline.py::test_labeled_retrieval_and_acl[cross-user]'], { env: { QUALITY_STAGE_FAULT: 'acl-bypass' }, expected: 'fail' });
  for (const control of ['missing-approval', 'unsupported-citation', 'cross-user-access', 'invented-detail', 'duplicate-write']) {
    await run(`controlled-${control}`, python, ['-m', 'scripts.inject_outcome_fault', '--control', control], { expected: 'fail', marker: `EXPECTED_FAULT_DETECTED:${control}:` });
  }
  await run('v1-negative-control', 'npm', ['run', 'negative-control']);
  await run('python-restored', python, ['-m', 'pytest', '-q', 'tests/test_deepeval_suite.py', 'tests/test_stage_pipeline.py', 'tests/test_outcome_controls.py', 'tests/test_reference_api.py', `--junitxml=${join(dir, 'python-restored.xml')}`]);
  await run('browser-restored', 'npm', ['run', 'test:e2e', '--', ...browserProjects]);
  await run('stage-metrics', python, ['-m', 'quality.report', '--output', join(dir, 'stage-metrics.json')]);
  if (k6Available) await run('bounded-k6', 'k6', ['run', 'nonfunctional/reference-load.js']);
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolveClose => { server.once('close', resolveClose); setTimeout(resolveClose, 3000).unref(); });
  }
}

const afterVersions = await captureVersions();
const sourceStableDuringRun = versions.shareableTreeSha256 === afterVersions.shareableTreeSha256;
const passed = sourceStableDuringRun && steps.every(step => ['pass', 'detected'].includes(step.status));
const report = {
  schemaVersion: 1, runId, timestamp: startedAt.toISOString(), target: 'independent synthetic reference target',
  mode: 'deterministic fixture; no model inference or production identity', git, versions, afterVersions, sourceStableDuringRun, budgets,
  selectedBrowserProjects: browserProjects.map(project => project.slice('--project='.length)),
  phases: ['baseline', 'controlled ACL fault and five outcome fault detections', 'restoration and full rerun'],
  steps, result: passed ? 'reference-cycle-pass' : 'reference-cycle-fail',
  negativeControls: { required: ['missing-approval', 'unsupported-citation', 'cross-user-access', 'invented-detail', 'duplicate-write'],
    source: 'datasets/v3/outcome-controls.json', status: ['missing-approval', 'unsupported-citation', 'cross-user-access', 'invented-detail', 'duplicate-write'].every(control => steps.find(step => step.name === `controlled-${control}`)?.status === 'detected') ? 'all five independently detected' : 'one or more missed' },
  cost: { measuredUsd: 0, modelTokens: 0, basis: 'No model is invoked by these commands.' },
  notApplicable: ['OCR, embedding/vector integrity, model judge variability, production authentication, native apps'],
  blocked: [...(!k6Available ? ['Local k6 execution: CLI unavailable'] : []),
    'Firefox headless startup on this macOS host: sandbox/framebuffer failure recorded in earlier browser runs',
    'Actual-product authenticated fixture unless separately run', 'Hosted CI because this repository has no remote'],
  limitations: ['Negative controls use original fictional structured evidence and a test-only synthetic ACL fault.',
    'Reference fixture actor selection is not authentication.', 'Passing this test set does not prove universal safety or production readiness.']
};
await writeFile(join(dir, 'index.json'), JSON.stringify(report, null, 2) + '\n');
const rows = steps.map(step => `| ${step.name} | ${step.status} | ${step.exitCode} | [log](${step.log})${step.browserProvenance ? `, [browser report](../../../${step.browserProvenance})` : ''} |`).join('\n');
const restoration = steps.find(step => step.name === 'python-restored')?.status === 'pass' && steps.find(step => step.name === 'browser-restored')?.status === 'pass'
  ? 'The restored Python and selected browser suites passed.' : 'One or more restored suites did not pass; inspect the step evidence.';
await writeFile(join(dir, 'index.md'), `# Quality cycle ${runId}\n\nTarget: independent synthetic reference. Model calls: 0. Result: **${report.result}**. Working tree dirty: ${git.workingTreeDirty}; commit: ${git.commit ?? 'unavailable'}.\n\nFixed provisional budgets: [config/budgets.v1.json](../../../config/budgets.v1.json). Dataset SHA-256: ${versions.datasetSha256}. Contract SHA-256: ${versions.contractSha256}. All ${versions.shareableFileCount} shareable files SHA-256: ${versions.shareableTreeSha256}. Source stable during run: ${sourceStableDuringRun}.\n\n| Step | Result | Exit | Evidence |\n|---|---:|---:|---|\n${rows}\n\n[Stage metrics](stage-metrics.json) · [Python baseline JUnit](python-baseline.xml) · [Python restored JUnit](python-restored.xml) · [Machine-readable index](index.json)\n\nThe controlled fault deliberately bypasses owner filtering in the in-memory synthetic index. The cross-user case fails under that fault. ${restoration} The five required outcome controls are structured task-level proxies. OCR and embeddings are not applicable to this lexical reference; model judges, real product identity, native apps and hosted CI are unverified here.\n`);
console.log(`Unified quality report: reports/runs/${runId}/index.md`);
process.exitCode = passed ? 0 : 1;
