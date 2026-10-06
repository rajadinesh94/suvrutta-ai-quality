import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/reference';
import { fictionalLake } from '../data/scenarios';

test('draft and retrieved source meet automated WCAG A/AA checks', async ({ referencePage, page }) => {
  await referencePage.open();
  await referencePage.setText(fictionalLake.edited);
  await referencePage.draft();
  await referencePage.expectStatus('Editable draft');
  const draft = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(draft.violations).toEqual([]);
  await referencePage.save();
  await referencePage.expectStatus('Saved as');
  await referencePage.setText(fictionalLake.query);
  await referencePage.retrieve();
  await referencePage.expectSource(fictionalLake.edited);
  const source = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(source.violations).toEqual([]);
});
