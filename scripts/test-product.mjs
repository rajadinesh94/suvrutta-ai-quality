import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const rawTarget = process.env.QUALITY_PRODUCT_BASE_URL;
if (!rawTarget) throw new Error('Set QUALITY_PRODUCT_BASE_URL to the separately started synthetic private fixture');
const target = new URL(rawTarget);
if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.username || target.password || target.search || target.hash) throw new Error('Product adapter accepts only a clean loopback URL');
const runId = `product-${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
const runDir = resolve(root, 'reports/runs', runId);
await mkdir(runDir, { recursive: true });
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const env = { ...process.env, QUALITY_RUN_DIR: runDir };
for (const key of ['LUNA_SERVICE_TOKEN', 'OPENAI_API_KEY', 'CONFIDENT_API_KEY', 'LANGFUSE_SECRET_KEY']) delete env[key];
const args = [cli, 'test', '--config=playwright.product.config.mjs', ...process.argv.slice(2)];
const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', value => resolveExit(value ?? 1)); });
let counts = null;
try {
  const report = JSON.parse(await readFile(join(runDir, 'playwright-results.json')));
  counts = { passed: report.stats?.expected ?? null, failed: report.stats?.unexpected ?? null,
    skipped: report.stats?.skipped ?? null, flaky: report.stats?.flaky ?? null };
} catch { /* Preserve runner failure without invented counts. */ }
const summary = {
  schemaVersion: 1, runId, timestamp: new Date().toISOString(), target: target.origin,
  mode: 'actual-product synthetic fixture; deterministic Luna route substitutes; no real inference',
  command: ['node', 'scripts/test-product.mjs', ...process.argv.slice(2)],
  result: code === 0 && counts?.passed > 0 && counts.failed === 0 ? 'pass' : 'fail',
  counts, exitCode: code,
  fixtureProvider: process.env.QUALITY_PRODUCT_FIXTURE_MODULE ? 'external private fixture module' : 'built-in visible synthetic actor controls',
  cost: { measuredUsd: 0, basis: 'The runner intercepts /v1/luna/health and /v1/luna/chat and blocks other origins.' },
  limitations: ['This local fixture does not prove production identity, persistence, paid model behavior, or native mobile operation.',
    'Traces and screenshots remain ignored and require review before sharing.']
};
await writeFile(join(runDir, 'provenance.json'), JSON.stringify(summary, null, 2) + '\n');
await writeFile(join(runDir, 'summary.md'), `# Actual-product synthetic fixture run ${runId}\n\nTarget: ${target.origin}  \nMode: ${summary.mode}  \nResult: ${summary.result}  \nCounts: ${counts ? `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped` : 'unavailable'}  \n\nNo real model inference or production identity is claimed.\n`);
console.log(`Product fixture provenance: reports/runs/${runId}/provenance.json`);
process.exitCode = summary.result === 'pass' ? 0 : 1;
