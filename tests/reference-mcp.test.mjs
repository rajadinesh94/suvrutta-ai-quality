import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReferenceMcp } from '../src/reference-mcp.mjs';

const call = (mcp, id, name, args) => mcp.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('reference MCP advertises bounded tools and protocol handshake', async () => {
  const mcp = createReferenceMcp({ actor: 'mira' });
  assert.equal((await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' })).result.protocolVersion, '2025-06-18');
  assert.deepEqual((await mcp.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools.map(tool => tool.name), ['story_search', 'get_source', 'approved_save']);
  assert.equal(await mcp.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await mcp.handle({ jsonrpc: '2.0', id: 3, method: 'missing' })).error.code, -32601);
});

test('reference MCP denies writes unless trusted host verifies exact operation', async () => {
  const approvals = new Set();
  const mcp = createReferenceMcp({ actor: 'mira', verifyApproval: ({ actor, approvalId, idempotencyKey, textSha256 }) => approvals.has(`${actor}:${approvalId}:${idempotencyKey}:${textSha256}`) });
  const args = { text: 'Adult Mira visited a fictional lake.', idempotencyKey: 'op-1', approvalId: 'approval-1' };
  assert.equal((await call(mcp, 1, 'approved_save', args)).result.isError, true);
  assert.equal(mcp.state.users.mira.stories.length, 0);
  const { createHash } = await import('node:crypto');
  approvals.add(`mira:approval-1:op-1:${createHash('sha256').update(args.text).digest('hex')}`);
  const saved = (await call(mcp, 2, 'approved_save', args)).result.structuredContent;
  assert.equal(saved.saved, true);
  assert.equal((await call(mcp, 3, 'approved_save', args)).result.structuredContent.duplicate, true);
  assert.equal((await call(mcp, 4, 'approved_save', { ...args, text: 'Different text.' })).result.isError, true);
  assert.equal(mcp.state.users.mira.stories.length, 1);
  assert.equal((await call(mcp, 5, 'story_search', { query: 'lake', limit: 1 })).result.structuredContent.sources[0].id, saved.storyId);
  assert.equal((await call(mcp, 6, 'get_source', { sourceId: saved.storyId })).result.structuredContent.text, args.text);
  assert.equal((await call(mcp, 7, 'story_search', { query: 'lake', limit: 50 })).result.isError, true);
});

test('reference MCP binds source reads to fixed actor and consent', async () => {
  const state = createReferenceMcp({ actor: 'mira' }).state;
  state.users.noor.stories.push({ id: 's1', text: 'Adult Noor kept a fictional cedar journal.', owner: 'noor' });
  const mcp = createReferenceMcp({ actor: 'mira', state });
  assert.equal((await call(mcp, 1, 'get_source', { sourceId: 's1' })).result.isError, true);
  assert.deepEqual((await call(mcp, 2, 'story_search', { query: 'cedar' })).result.structuredContent.sources, []);
  state.users.mira.consent = false;
  assert.equal((await call(mcp, 3, 'story_search', { query: 'cedar' })).result.isError, true);
  assert.equal((await call(mcp, 4, 'approved_save', { text: 'x', idempotencyKey: 'x', approvalId: 'x', approved: true })).result.isError, true);
});

test('stdio MCP accepts newline JSON-RPC and returns safe parse errors', () => {
  const output = execFileSync(process.execPath, ['src/reference-mcp.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, QUALITY_MCP_ACTOR: 'mira' },
    input: '{bad json}\n{"jsonrpc":"2.0","id":1,"method":"initialize"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"approved_save","arguments":{"text":"fictional","idempotencyKey":"k","approvalId":"a"}}}\n',
    encoding: 'utf8', timeout: 3000,
  });
  const [parse, init, save] = output.trim().split('\n').map(JSON.parse);
  assert.equal(parse.error.code, -32700);
  assert.equal(init.result.serverInfo.name, 'synthetic-reference-mcp');
  assert.equal(save.result.isError, true);
  assert.match(save.result.content[0].text, /APPROVAL_REQUIRED/);
});
