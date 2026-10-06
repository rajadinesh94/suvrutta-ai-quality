import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = resolve(root, '.local/langfuse');
const version = 'v4.50.0';
const upstreamUrl = `https://raw.githubusercontent.com/langfuse/langfuse/${version}/docker-compose.yml`;
const upstreamSha256 = 'd0309ef3072dba426c6f81f56d46f446361099a8fc0fdf1b042bdf822d85ac3a';
const composePath = resolve(folder, 'docker-compose.yml');
const envPath = resolve(folder, '.env');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const secret = (bytes = 32) => randomBytes(bytes).toString('hex');

await mkdir(folder, { recursive: true });
let upstream;
try { upstream = await readFile(resolve(folder, 'docker-compose.upstream.yml')); } catch {
  const response = await fetch(upstreamUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Official compose download failed: HTTP ${response.status}`);
  upstream = Buffer.from(await response.arrayBuffer());
  await writeFile(resolve(folder, 'docker-compose.upstream.yml'), upstream);
}
if (sha256(upstream) !== upstreamSha256) throw new Error('Official compose checksum mismatch; no stack started');
let compose = upstream.toString('utf8');
const replaceOnce = (oldText, newText) => {
  if (!compose.includes(oldText) || compose.indexOf(oldText) !== compose.lastIndexOf(oldText)) throw new Error(`Upstream compose shape changed near ${oldText.slice(0, 30)}`);
  compose = compose.replace(oldText, newText);
};
replaceOnce('image: docker.langfuse.com/langfuse/langfuse-worker:4', 'image: docker.io/langfuse/langfuse-worker:4.50.0');
replaceOnce('image: docker.langfuse.com/langfuse/langfuse:4', 'image: docker.io/langfuse/langfuse:4.50.0');
replaceOnce('      - 3000:3000', '      - 127.0.0.1:3000:3000');
replaceOnce('      - 9090:9000', '      - 127.0.0.1:9090:9000');
replaceOnce('    ports:\n      - 127.0.0.1:3030:3030\n', '');
replaceOnce('    ports:\n      - 127.0.0.1:8123:8123\n      - 127.0.0.1:9000:9000\n', '');
replaceOnce('    ports:\n      - 127.0.0.1:6379:6379\n', '');
replaceOnce('    ports:\n      - 127.0.0.1:5432:5432\n', '');
replaceOnce('      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-mysecret} # CHANGEME', '      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-mysecret} # CHANGEME\n      AUTH_DISABLE_SIGNUP: true');
compose = `name: quality-local-langfuse\n${compose}`;
await writeFile(composePath, compose);
let existing = false;
try { await readFile(envPath); existing = true; } catch { /* First setup only. */ }
if (!existing) {
  const dbPassword = secret();
  const minioUser = `local${secret(8)}`;
  const minioPassword = secret();
  const lines = [
    'NEXTAUTH_URL=http://localhost:3000',
    `NEXTAUTH_SECRET=${secret()}`,
    `SALT=${secret()}`,
    `ENCRYPTION_KEY=${secret()}`,
    `POSTGRES_PASSWORD=${dbPassword}`,
    `DATABASE_URL=postgresql://postgres:${dbPassword}@postgres:5432/postgres`,
    `CLICKHOUSE_PASSWORD=${secret()}`,
    `REDIS_AUTH=${secret()}`,
    `MINIO_ROOT_USER=${minioUser}`,
    `MINIO_ROOT_PASSWORD=${minioPassword}`,
    `LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID=${minioUser}`,
    `LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY=${minioPassword}`,
    `LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID=${minioUser}`,
    `LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY=${minioPassword}`,
    `LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID=${minioUser}`,
    `LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY=${minioPassword}`,
    'TELEMETRY_ENABLED=false',
    'LANGFUSE_IN_APP_AGENT_ENABLED=false',
    'LANGFUSE_INIT_ORG_ID=quality-local',
    'LANGFUSE_INIT_ORG_NAME=QualityLocal',
    'LANGFUSE_INIT_PROJECT_ID=fictional-evals',
    'LANGFUSE_INIT_PROJECT_NAME=FictionalEvals',
    `LANGFUSE_INIT_PROJECT_PUBLIC_KEY=pk-lf-${secret(16)}`,
    `LANGFUSE_INIT_PROJECT_SECRET_KEY=sk-lf-${secret(16)}`,
    'LANGFUSE_INIT_USER_EMAIL=eval-local@example.invalid',
    'LANGFUSE_INIT_USER_NAME=LocalEvaluator',
    `LANGFUSE_INIT_USER_PASSWORD=${secret()}`,
  ];
  await writeFile(envPath, lines.join('\n') + '\n', { mode: 0o600 });
}
await chmod(envPath, 0o600);
console.log(`Prepared pinned official Langfuse ${version} compose in ignored .local/langfuse with local-only ports and generated private credentials.`);
console.log('Start: docker compose --env-file .local/langfuse/.env -f .local/langfuse/docker-compose.yml up -d');
