// Review aid: reports locations and finding types, never matched secret values.
import { readdir, readFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { relative, join } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const shareableOnly = process.argv.includes('--shareable-only');
const findings = [];
const checks = [
  ['personal_absolute_path', new RegExp('/Users/[A-Za-z0-9._-]+/')],
  ['private_product_checkout', new RegExp('suvrutta' + '-site', 'i')],
  ['private_key_block', new RegExp('BEGIN [A-Z ]*PRIVATE KEY')],
  ['credential_token', new RegExp('(?:ghp_|github_pat_|sk-proj-|AIza)[A-Za-z0-9_-]{10,}')],
  ['credential_assignment', new RegExp('(?:api[_-]?key|secret|password|access[_-]?token)\\s*[:=]\\s*["\x27][^"\x27\\s]{12,}', 'i')],
  ['email_address', new RegExp('[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.(?:com|org|net|edu|gov|in|io|dev)\\b', 'i')]
];
const scanText = (name, value) => { for (const [type, pattern] of checks) if (pattern.test(value)) findings.push({ path: name, type }); };
async function scanFile(full, name) {
    const info = await lstat(full);
    if (info.isSymbolicLink()) { findings.push({ path: name, type: 'symlink_manual_review' }); return; }
    if (info.size > 10_000_000) { findings.push({ path: name, type: 'large_file_manual_review' }); return; }
    const data = await readFile(full);
    if (/\.(png|jpg|jpeg|webp|pdf|mp4|mov)$/i.test(name)) { findings.push({ path: name, type: 'media_manual_review' }); return; }
    if (/\.zip$/i.test(name)) {
      try {
        const entries = execFileSync('unzip', ['-Z1', full], { encoding: 'utf8', maxBuffer: 5_000_000 }).trim().split('\n');
        for (const entry of entries) {
          scanText(`${name}!${entry}`, entry);
          if (/\.(png|jpg|jpeg|webp|pdf|mp4|mov)$/i.test(entry)) findings.push({ path: `${name}!${entry}`, type: 'media_manual_review' });
          else {
            const bytes = execFileSync('unzip', ['-p', full, entry], { maxBuffer: 10_000_000 });
            if (bytes.includes(0)) findings.push({ path: `${name}!${entry}`, type: 'archive_binary_manual_review' });
            else scanText(`${name}!${entry}`, bytes.toString('utf8'));
          }
        }
      } catch { findings.push({ path: name, type: 'archive_unreadable' }); }
      return;
    }
    if (data.includes(0)) { findings.push({ path: name, type: 'binary_manual_review' }); return; }
    scanText(name, data.toString('utf8'));
}
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (dir === root && ['.git', 'node_modules'].includes(item.name)) continue; // Git history and installed dependencies are checked separately.
    const full = join(dir, item.name);
    const name = relative(root, full);
    if (item.isDirectory()) { await walk(full); continue; }
    await scanFile(full, name);
  }
}
if (shareableOnly) {
  const files = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const name of files) await scanFile(join(root, name), name);
} else await walk(root);
try {
  const objects = execFileSync('git', ['rev-list', '--objects', '--all'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const object of objects) {
    const [sha, ...pathParts] = object.split(' ');
    const name = pathParts.join(' ') || '(unnamed)';
    scanText(`history:path:${name}`, name);
    if (execFileSync('git', ['cat-file', '-t', sha], { cwd: root, encoding: 'utf8' }).trim() !== 'blob') continue;
    const data = execFileSync('git', ['cat-file', 'blob', sha], { cwd: root, maxBuffer: 10_000_000 });
    if (data.includes(0)) findings.push({ path: `history:${name}`, type: 'binary_manual_review' });
    else scanText(`history:${name}`, data.toString('utf8'));
  }
  if (objects.length) {
    const metadata = execFileSync('git', ['log', '--all', '--format=%H%n%an%n%ae%n%cn%n%ce%n%B'], { cwd: root, encoding: 'utf8' });
    scanText('history:commit-metadata', metadata);
  }
  const remotes = execFileSync('git', ['remote', '-v'], { cwd: root, encoding: 'utf8' });
  scanText('git:remotes', remotes);
} catch { findings.push({ path: '.git', type: 'history_unavailable' }); }
console.log(JSON.stringify({ scanned: shareableOnly ? 'Git index shareable files plus Git history' : 'working tree including ignored artifacts, plus Git history; installed node_modules excluded', findings }, null, 2));
if (findings.length) process.exitCode = 1;
