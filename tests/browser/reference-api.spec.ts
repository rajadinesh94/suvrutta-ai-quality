import { test, expect } from '../fixtures/reference';
import { fictionalCedar, fictionalLake } from '../data/scenarios';

test('API preserves edited draft only after approval and owner retrieval', async ({ reference }) => {
  const draft = await reference.action('mira', 'capture', { text: fictionalLake.initial });
  expect(draft.status).toBe(200);
  expect(draft.draft).toBe(fictionalLake.initial);
  expect(draft.clarification).toBeTruthy();
  expect((await reference.action('mira', 'retrieve', { query: fictionalLake.query })).sources).toEqual([]);
  const denied = await reference.action('mira', 'save', { text: fictionalLake.edited, idempotencyKey: 'typed-case' });
  expect([denied.status, denied.code]).toEqual([409, 'confirmation_required']);
  const saved = await reference.action('mira', 'save', { text: fictionalLake.edited, idempotencyKey: 'typed-case', confirmed: true });
  expect(saved.saved).toBe(true);
  const own = await reference.action('mira', 'retrieve', { query: fictionalLake.query });
  expect(own.sources).toEqual([{ id: saved.storyId, text: fictionalLake.edited }]);
  expect((await reference.action('noor', 'retrieve', { query: fictionalLake.query })).sources).toEqual([]);
  expect((await reference.action('noor', 'delete', { storyId: saved.storyId, confirmed: true })).status).toBe(404);
  expect((await reference.action('mira', 'delete', { storyId: saved.storyId, confirmed: true })).deleted).toBe(true);
  expect((await reference.action('mira', 'retrieve', { query: fictionalLake.query })).sources).toEqual([]);
});

test('API prevents duplicate writes and respects revoked consent', async ({ reference }) => {
  const args = { text: fictionalCedar.text, idempotencyKey: 'cedar-case', confirmed: true };
  const first = await reference.action('noor', 'save', args);
  const retry = await reference.action('noor', 'save', args);
  expect(retry.storyId).toBe(first.storyId);
  expect(retry.duplicate).toBe(true);
  expect((await reference.action('noor', 'retrieve', { query: fictionalCedar.query })).sources).toHaveLength(1);
  expect((await reference.action('noor', 'consent', { enabled: false })).consent).toBe(false);
  expect((await reference.action('noor', 'retrieve', { query: fictionalCedar.query })).code).toBe('consent_required');
  expect((await reference.action('noor', 'save', { ...args, idempotencyKey: 'second' })).status).toBe(403);
});

test('UI journey displays the exact edited source and clears it on fixture switch', async ({ reference, referencePage, page }) => {
  await referencePage.open();
  await referencePage.setText(fictionalLake.initial);
  await referencePage.draft();
  await referencePage.expectStatus('What changed');
  await referencePage.setText(fictionalLake.edited);
  await referencePage.save();
  await referencePage.expectStatus('Saved as');
  await referencePage.setText(fictionalLake.query);
  await referencePage.retrieve();
  await referencePage.expectSource(fictionalLake.edited);
  await referencePage.switchActor('noor');
  await expect(page.locator('#source')).toHaveText('No source selected.');
  await referencePage.setText(fictionalLake.query);
  await referencePage.retrieve();
  await referencePage.expectStatus('could not find');
});
