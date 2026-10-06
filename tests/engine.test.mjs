import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, perform } from '../src/engine.mjs';
test('revocation blocks subsequent retrieval and saving', () => {
  const state = createState();
  assert.equal(perform(state, 'mira', { tool: 'save', args: { text: 'A fictional river walk', confirmed: true, idempotencyKey: 'one' } }).status, 200);
  assert.equal(perform(state, 'mira', { tool: 'retrieve', args: { query: 'river' } }).sources.length, 1);
  perform(state, 'mira', { tool: 'consent', args: { enabled: false } });
  assert.equal(perform(state, 'mira', { tool: 'retrieve', args: { query: 'river' } }).status, 403);
  assert.equal(perform(state, 'mira', { tool: 'save', args: { text: 'Second', confirmed: true, idempotencyKey: 'two' } }).status, 403);
});
test('uncertain write retry is idempotent', () => {
  const state = createState();
  const request = { tool: 'save', args: { text: 'Fictional morning', confirmed: true, idempotencyKey: 'stable' } };
  assert.equal(perform(state, 'mira', request, { failWrite: 'after' }).code, 'write_uncertain');
  assert.equal(perform(state, 'mira', request).duplicate, true);
  assert.equal(state.users.mira.stories.length, 1);
});
test('deleted IDs are never reused and inherited actor names are rejected', () => {
  const state = createState();
  const save = (text, idempotencyKey) => perform(state, 'mira', { tool: 'save', args: { text, confirmed: true, idempotencyKey } });
  assert.equal(save('First fictional item', 'one').storyId, 's1');
  assert.equal(save('Second fictional item', 'two').storyId, 's2');
  assert.equal(perform(state, 'mira', { tool: 'delete', args: { storyId: 's1', confirmed: true } }).status, 200);
  assert.equal(save('Third fictional item', 'three').storyId, 's3');
  for (const actor of ['__proto__', 'constructor', 'toString']) {
    assert.equal(perform(state, actor, { tool: 'retrieve', args: { query: 'fictional' } }).status, 401);
  }
});
