import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const index = process.argv.indexOf('--report');
if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node scripts/export-langfuse.mjs --report reports/runs/LIVE.json');
const report = resolve(root, process.argv[index + 1]);
const envText = await readFile(resolve(root, '.local/langfuse/.env'), 'utf8');
const values = Object.fromEntries(envText.split('\n').filter(line => line && !line.startsWith('#')).map(line => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
if (!values.LANGFUSE_INIT_PROJECT_PUBLIC_KEY || !values.LANGFUSE_INIT_PROJECT_SECRET_KEY) throw new Error('Local Langfuse project keys are missing');
const python = resolve(root, '.local/eval-venv/bin/python');
const child = spawn(python, ['scripts/evaluate_deepeval.py', '--report', report, '--trace', 'langfuse', '--allow-export'], {
  cwd: root,
  env: { ...process.env, LANGFUSE_PUBLIC_KEY: values.LANGFUSE_INIT_PROJECT_PUBLIC_KEY, LANGFUSE_SECRET_KEY: values.LANGFUSE_INIT_PROJECT_SECRET_KEY, LANGFUSE_BASE_URL: 'http://127.0.0.1:3000' },
  stdio: 'inherit'
});
const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', exitCode => resolveExit(exitCode ?? 1)); });
process.exitCode = code;
