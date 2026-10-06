// MCP over stdio for the independent synthetic reference. The host, not a tool
// argument, fixes the fixture actor and verifies any write approval.
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createState, perform } from './engine.mjs';

const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const toolError = code => ({ content: [{ type: 'text', text: code }], isError: true });
const toolResult = result => ({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
const tools = [
  { name: 'story_search', description: 'Find at most five owned fictional sources in the in-memory reference.', inputSchema: { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', minLength: 1, maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 5 } } } },
  { name: 'get_source', description: 'Read one owned fictional source by ID.', inputSchema: { type: 'object', required: ['sourceId'], additionalProperties: false, properties: { sourceId: { type: 'string', pattern: '^s[0-9]+$' } } } },
  { name: 'approved_save', description: 'Save a fictional story only if the trusted host verifies approval for this actor, exact text, and request key.', inputSchema: { type: 'object', required: ['text', 'idempotencyKey', 'approvalId'], additionalProperties: false, properties: { text: { type: 'string', minLength: 1, maxLength: 3000 }, idempotencyKey: { type: 'string', minLength: 1, maxLength: 80 }, approvalId: { type: 'string', minLength: 1, maxLength: 80 } } } },
];

const exactKeys = (value, allowed, required) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key));

export function createReferenceMcp({ actor, state = createState(), verifyApproval = async () => false } = {}) {
  if (!['mira', 'noor'].includes(actor) || typeof verifyApproval !== 'function') throw new Error('Trusted fixture actor and approval verifier required');
  async function call(name, args) {
    if (name === 'story_search') {
      if (!exactKeys(args, ['query', 'limit'], ['query']) || typeof args.query !== 'string' || !args.query.trim() || args.query.length > 200 || (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 5))) return toolError('INVALID_ARGUMENTS');
      const result = perform(state, actor, { tool: 'retrieve', args: { query: args.query } });
      if (result.status !== 200) return toolError(result.code ?? 'SEARCH_DENIED');
      return toolResult({ sources: result.sources.slice(0, args.limit ?? 5).map(source => ({ id: source.id, text: source.text, trust: 'untrusted source text' })), simulated: true });
    }
    if (name === 'get_source') {
      if (!exactKeys(args, ['sourceId'], ['sourceId']) || typeof args.sourceId !== 'string' || !/^s\d+$/.test(args.sourceId)) return toolError('INVALID_ARGUMENTS');
      if (!state.users[actor].consent) return toolError('CONSENT_REQUIRED');
      const source = state.users[actor].stories.find(story => story.id === args.sourceId);
      return source ? toolResult({ id: source.id, text: source.text, trust: 'untrusted source text', simulated: true }) : toolError('SOURCE_NOT_FOUND');
    }
    if (name === 'approved_save') {
      if (!exactKeys(args, ['text', 'idempotencyKey', 'approvalId'], ['text', 'idempotencyKey', 'approvalId']) || typeof args.text !== 'string' || !args.text.trim() || args.text.length > 3000 || !safeId(args.idempotencyKey) || !safeId(args.approvalId)) return toolError('INVALID_ARGUMENTS');
      const digest = createHash('sha256').update(args.text).digest('hex');
      let approved = false;
      try {
        approved = await Promise.race([Promise.resolve(verifyApproval({ actor, approvalId: args.approvalId, idempotencyKey: args.idempotencyKey, textSha256: digest })), new Promise(resolve => setTimeout(() => resolve(false), 500))]);
      } catch { /* Safe denial; verifier internals are never returned. */ }
      if (approved !== true) return toolError('APPROVAL_REQUIRED');
      const result = perform(state, actor, { tool: 'save', args: { text: args.text, idempotencyKey: args.idempotencyKey, confirmed: true } });
      return result.status === 200 ? toolResult({ storyId: result.storyId, saved: result.saved, duplicate: result.duplicate, simulated: true }) : toolError(result.code ?? 'SAVE_DENIED');
    }
    return toolError('UNKNOWN_TOOL');
  }
  return {
    state,
    async handle(request) {
      if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return { jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
      if (request.method === 'notifications/initialized') return null;
      const id = request.id ?? null;
      if (id === null) return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Request ID required' } };
      if (request.method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'synthetic-reference-mcp', version: '1.0.0' } } };
      if (request.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
      if (request.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools } };
      if (request.method === 'tools/call') {
        const params = request.params;
        if (!exactKeys(params, ['name', 'arguments'], ['name']) || typeof params.name !== 'string') return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params' } };
        return { jsonrpc: '2.0', id, result: await call(params.name, params.arguments ?? {}) };
      }
      return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
    },
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const actor = process.env.QUALITY_MCP_ACTOR;
  const mcp = createReferenceMcp({ actor });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (Buffer.byteLength(line) > 16384) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }) + '\n'); continue; }
    let request;
    try { request = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); continue; }
    const response = await mcp.handle(request);
    if (response) process.stdout.write(JSON.stringify(response) + '\n');
  }
}
