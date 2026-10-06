import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = process.platform === 'win32' ? ['.local/eval-venv/Scripts/python.exe'] : ['.local/eval-venv/bin/python'];
let python;
for (const candidate of candidates) {
  try { await access(resolve(root, candidate)); python = resolve(root, candidate); break; } catch { /* Try next platform path. */ }
}
if (!python) throw new Error('Create .local/eval-venv with Python 3.12 and install scripts/requirements-eval.txt first');
const testMode = process.argv.includes('--test');
const forwarded = process.argv.slice(2).filter(value => value !== '--test');
const argumentsForPython = testMode
  ? ['-m', 'pytest', '-q', 'tests/test_deepeval_suite.py', 'tests/test_stage_pipeline.py', 'tests/test_outcome_controls.py', 'tests/test_reference_api.py', ...forwarded]
  : ['scripts/evaluate_deepeval.py', ...forwarded];
const child = spawn(python, argumentsForPython, { cwd: root, stdio: 'inherit' });
const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', exitCode => resolveExit(exitCode ?? 1)); });
process.exitCode = code;
