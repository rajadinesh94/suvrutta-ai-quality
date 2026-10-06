import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './product-fixture';

// Scan the actual product fixture after meaningful state changes. No rule or
// node exclusions: reference-app results cannot substitute for these screens.
test('actual product draft and retrieved sources meet automated WCAG AA checks', async ({ page, product }) => {
  await product.openChat();
  await product.prepareFictionalDraft('Adult Mira visited a fictional lake and enjoyed its quiet water.');
  await expect(page.getByRole('textbox', { name: 'Story title' })).toBeVisible();
  const draft = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect.soft(draft.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) })), 'draft accessibility').toEqual([]);

  await page.getByRole('textbox', { name: 'Story title' }).fill('Fictional Quiet Lake');
  await page.getByRole('button', { name: 'Approve and save story' }).click();
  await page.getByRole('checkbox', { name: 'Allow local search of my unlocked saved stories' }).check();
  await page.getByRole('textbox', { name: 'Search my saved stories' }).fill('lake');
  await page.getByRole('button', { name: 'Search saved stories' }).click();
  await expect(page.getByRole('button', { name: 'Open source: Fictional Quiet Lake' })).toBeVisible();
  const retrieval = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(retrieval.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })) })), 'source retrieval accessibility').toEqual([]);
});
