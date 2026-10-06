import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createState, perform } from './engine.mjs';
const root = fileURLToPath(new URL('./', import.meta.url));
let state = createState();
const html = await readFile(new URL('./index.html', import.meta.url));
const js = await readFile(new URL('./ui.mjs', import.meta.url));
const readBody = async req => {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 12000) throw new Error('Request too large'); }
  return JSON.parse(body || '{}');
};
export const server = http.createServer(async (req, res) => {
  const respond = (code, payload) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(payload)); };
  try {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
    if (req.method === 'GET' && req.url === '/ui.mjs') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(js); return; }
    if (req.method === 'POST' && req.url === '/api/reset') { state = createState(); respond(200, { reset: true }); return; }
    if (req.method === 'POST' && req.url === '/api/action') {
      const { actor, tool, args, fault } = await readBody(req);
      if (fault === 'timeout') await new Promise(resolve => setTimeout(resolve, 1400));
      const result = perform(state, actor, { tool, args }, { failWrite: fault === 'before' || fault === 'after' ? fault : undefined });
      respond(result.status, result); return;
    }
    if (req.method === 'GET' && req.url === '/health') { respond(200, { target: 'reference', mode: 'simulated-mock' }); return; }
    respond(404, { code: 'not_found' });
  } catch { respond(400, { code: 'bad_request' }); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4175);
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Synthetic reference target on http://127.0.0.1:${port}\n`));
}
