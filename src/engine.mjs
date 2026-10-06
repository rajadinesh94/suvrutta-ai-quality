// An original, synthetic reference target. This is deliberately not an authentication implementation.
import { createHash } from 'node:crypto';
const fictionalUsers = ['mira', 'noor'];
export function createState() {
  return { users: Object.fromEntries(fictionalUsers.map(id => [id, { consent: true, stories: [], nextStoryId: 1 }])), receipts: {}, calls: [] };
}
const error = (status, code, message) => ({ status, code, message });
const own = (state, user) => Object.hasOwn(state.users, user) ? state.users[user] : undefined;
const clean = value => typeof value === 'string' ? value.trim().slice(0, 4000) : '';
export function perform(state, actor, request, options = {}) {
  const started = Date.now();
  const tool = clean(request?.tool);
  const args = request?.args ?? {};
  const before = own(state, actor);
  const trace = { actor: fictionalUsers.includes(actor) ? actor : 'unknown', tool, argumentKeys: Object.keys(args).sort(), argumentSha256: createHash('sha256').update(JSON.stringify(args)).digest('hex'), status: 'started', state: { storiesBefore: before?.stories.length ?? null, consentBefore: before?.consent ?? null } };
  state.calls.push(trace);
  let result;
  if (!own(state, actor)) result = error(401, 'unauthenticated', 'Choose a fictional user.');
  else if (tool === 'consent') {
    if (typeof args.enabled !== 'boolean') result = error(400, 'invalid_consent', 'Consent must be true or false.');
    else { own(state, actor).consent = args.enabled; result = { status: 200, consent: args.enabled }; }
  } else if (tool === 'capture') {
    const body = clean(args.text);
    if (!body) result = error(400, 'empty', 'Add an experience first.');
    else if (body.length > 3000) result = error(400, 'limit', 'Experience is too long.');
    else result = { status: 200, draft: body, clarification: /\b(then|because|felt)\b/i.test(body) ? null : 'What changed for you in that moment?', simulated: true };
  } else if (tool === 'save') {
    const idempotencyKey = clean(args.idempotencyKey);
    const body = clean(args.text);
    const key = `${actor}:${idempotencyKey}`;
    if (!own(state, actor).consent) result = error(403, 'consent_required', 'Saving requires consent.');
    else if (args.confirmed !== true) result = error(409, 'confirmation_required', 'Confirm this draft before saving.');
    else if (!idempotencyKey || !body || body.length > 3000) result = error(400, 'invalid_save', 'A draft and request ID are required.');
    else if (state.receipts[key]) result = !own(state, actor).stories.some(story => story.id === state.receipts[key].storyId)
      ? error(409, 'receipt_deleted', 'The earlier saved story was deleted.')
      : state.receipts[key].digest === createHash('sha256').update(body).digest('hex')
        ? { status: 200, storyId: state.receipts[key].storyId, saved: true, duplicate: true }
        : error(409, 'idempotency_conflict', 'This request ID belongs to a different draft.');
    else if (options.failWrite === 'before') result = error(503, 'write_failed', 'Nothing was saved. Retry with the same request ID.');
    else {
      const story = { id: `s${own(state, actor).nextStoryId++}`, text: body, owner: actor };
      own(state, actor).stories.push(story);
      state.receipts[key] = { storyId: story.id, digest: createHash('sha256').update(body).digest('hex') };
      result = options.failWrite === 'after' ? error(503, 'write_uncertain', 'Save outcome is uncertain. Retry with the same request ID.') : { status: 200, storyId: story.id, saved: true, duplicate: false };
    }
  } else if (tool === 'retrieve') {
    if (!own(state, actor).consent && !options.allowRevokedRetrieve) result = error(403, 'consent_required', 'Access was revoked.');
    else {
      const query = clean(args.query).toLowerCase();
      const words = query.match(/[\p{L}\p{N}]+/gu)?.filter(word => word.length > 3) ?? [];
      const matches = own(state, actor).stories.filter(story => words.some(word => story.text.toLowerCase().includes(word)));
      result = { status: 200, answer: matches.length ? 'Found your saved experience. Review the source below.' : 'I could not find a supported memory.', sources: matches.map(({ id, text }) => ({ id, text })), simulated: true };
    }
  } else if (tool === 'delete') {
    if (args.confirmed !== true) result = error(409, 'confirmation_required', 'Confirm deletion first.');
    else if (!own(state, actor).stories.some(story => story.id === args.storyId)) result = error(404, 'story_not_found', 'No owned story has that ID.');
    else { own(state, actor).stories = own(state, actor).stories.filter(story => story.id !== args.storyId); result = { status: 200, deleted: true }; }
  } else result = error(400, 'unknown_tool', 'Unsupported action.');
  trace.status = result.status;
  trace.code = result.code ?? 'ok';
  trace.durationMs = Date.now() - started;
  const after = own(state, actor);
  trace.state.storiesAfter = after?.stories.length ?? null;
  trace.state.consentAfter = after?.consent ?? null;
  return result;
}
