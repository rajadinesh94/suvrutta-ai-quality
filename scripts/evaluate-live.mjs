import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SYSTEM_PROMPT, createHttpProvider, createLunaServiceProvider, runConversations, validateDatasets, sha256, summarizeUsage } from '../src/live-evaluator.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(`--${name}`); return index < 0 ? null : args[index + 1]; };
const number = name => { const value = option(name); return value === null ? null : Number(value); };
const datasets = await Promise.all(['development', 'heldout'].map(async split => JSON.parse(await readFile(new URL(`../datasets/v2/${split}.json`, import.meta.url), 'utf8'))));
validateDatasets(datasets);
if (args.includes('--list')) { for (const dataset of datasets) for (const item of dataset.cases) console.log(`${item.id}\t${dataset.split}\t${item.category}\t${item.severity}\t${item.turns.length} turns`); process.exit(0); }
const providerName = option('provider');
const maxCalls = number('max-calls');
const repeats = number('repeats') ?? 1;
const selectedIds = option('cases')?.split(',').filter(Boolean);
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 500) throw new Error('Supply --max-calls between 1 and 500');
if (providerName === 'luna-service' && maxCalls > 24) throw new Error('Budgeted Luna runs are capped at 24 calls');
const timeoutMs = number('timeout-ms') ?? 15000;
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error('Timeout must be 1000–30000 ms');
let provider;
if (providerName === 'http') {
  if (!option('endpoint')) throw new Error('Supply --endpoint with an explicit loopback URL');
  provider = createHttpProvider({ endpoint: option('endpoint'), timeoutMs, roleMode: option('role-mode') ?? 'full' });
} else if (providerName === 'luna-service') {
  if (!args.includes('--enable-paid')) throw new Error('Paid provider is disabled; explicit --enable-paid is required');
  provider = createLunaServiceProvider({ endpoint: option('endpoint'), trustedOrigin: option('trusted-service-origin'), token: process.env.LUNA_SERVICE_TOKEN, sessionId: option('session-id'), timeoutMs });
} else throw new Error('Supply --provider http or --provider luna-service');
const selected = datasets.flatMap(data => data.cases).filter(item => !selectedIds || selectedIds.includes(item.id));
const requiredCalls = selected.reduce((sum, item) => sum + item.turns.length * repeats, 0);
if (!selected.length || requiredCalls > maxCalls) throw new Error(`Selected cases require ${requiredCalls} calls; cap is ${maxCalls}`);
const allFiles = [];
async function files(directory) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    if (entry.name === '__pycache__' || /\.py[cod]$/.test(entry.name)) continue;
    const name = join(directory, entry.name);
    if (entry.isDirectory()) await files(name);
    else if (entry.isFile()) allFiles.push(name);
  }
}
for (const directory of ['src', 'scripts', 'tests', 'datasets', 'contracts', '.github']) await files(directory);
const content = new Map(await Promise.all(allFiles.map(async name => [name, await readFile(resolve(root, name))])));
const hashGroup = names => { const hash = createHash('sha256'); for (const name of names.sort()) { hash.update(name); hash.update('\0'); hash.update(content.get(name)); hash.update('\0'); } return hash.digest('hex'); };
const codeFiles = allFiles.filter(name => /^(src|scripts|tests)\//.test(name));
const datasetFiles = allFiles.filter(name => /^datasets\/v2\//.test(name));
const contractFiles = allFiles.filter(name => name.startsWith('contracts/'));
const configFiles = ['package.json', 'package-lock.json', 'playwright.config.mjs', ...allFiles.filter(name => name.startsWith('.github/'))];
for (const name of configFiles.slice(0, 3)) content.set(name, await readFile(resolve(root, name)));
const config = { provider: providerName, target: provider.target, trustedServiceOrigin: option('trusted-service-origin'), roleMode: option('role-mode') ?? 'full', maxCalls, repeats, selectedIds: selected.map(item => item.id), timeoutMs, paidEnabled: args.includes('--enable-paid'), sessionIdSha256: option('session-id') ? sha256(option('session-id')) : null };
const versions = { codeSha256: hashGroup(codeFiles), promptSha256: sha256(SYSTEM_PROMPT), datasetSha256: hashGroup(datasetFiles), contractSha256: hashGroup(contractFiles), configSha256: sha256(hashGroup(configFiles) + JSON.stringify(config)), datasetVersion: 'v2.0' };
const started = new Date();
const evaluated = await runConversations({ datasets, provider, selectedIds, repeats, maxCalls, requestNamespace: `${started.toISOString().replace(/[-:.]/g, '')}-${process.pid}`, onProgress: result => console.log(`${result.id}#${result.repeat}: ${result.status}`) });
const report = { schemaVersion: 2, runId: `${started.toISOString().replace(/[-:.]/g, '')}-${process.pid}-live`, timestamp: started.toISOString(), target: provider.target, mode: provider.mode, versions, config, callCount: evaluated.calls, callCountMeaning: 'request attempts; a provider error does not prove whether generation occurred', usage: summarizeUsage(evaluated.results), ...evaluated, limitations: ['Original fictional cases only; this run does not establish private product behavior.', 'Literal checks cover specified strings only. Human semantic judgments remain pending.', 'No tools or backend actions are observed through the conversational endpoint.'] };
const folder = resolve(root, 'reports/runs'); await mkdir(folder, { recursive: true });
const basename = `${report.runId}`;
await writeFile(join(folder, `${basename}.json`), JSON.stringify(report, null, 2) + '\n');
const rows = report.results.map(item => `| ${item.id} | ${item.repeat} | ${item.severity} | ${item.status} | ${item.humanLabel} |`).join('\n');
const markdown = `# Live conversational evaluation\n\nRun: ${report.runId}  \nTarget: ${report.target}  \nMode: ${report.mode}  \nDataset: ${versions.datasetVersion}  \nCode SHA-256: ${versions.codeSha256}  \nPrompt SHA-256: ${versions.promptSha256}  \nDataset SHA-256: ${versions.datasetSha256}  \nConfig SHA-256: ${versions.configSha256}  \nCalls: ${report.callCount}; literal pass: ${report.summary.literalPass}; literal fail: ${report.summary.literalFail}; no literal checks: ${report.summary.noLiteralChecks}; errors: ${report.summary.errors}; human labels pending: ${report.summary.pendingHumanLabels}.  \nGate: ${report.gate}; critical generated-text canaries or provider errors: ${report.criticalFailures.join(', ') || 'none observed'}.  \nACL assessment: ${report.aclAssessment}.  \nUsage: ${JSON.stringify(report.usage)}.\n\n| Case | Repeat | Severity | Literal status | Human label |\n|---|---:|---|---|---|\n${rows}\n\nLiteral checks do not prove semantic quality or a real cross-user disclosure. This endpoint provides no tool or data ACL observation. Review the JSON turns and label each response with the human rubric. This independent run uses only original fictional prompts.\n`;
await writeFile(join(folder, `${basename}.md`), markdown);
console.log(join(folder, `${basename}.json`));
if (report.criticalFailures.length || report.summary.errors || report.summary.literalFail) process.exitCode = 1;
