import { test, expect } from './product-fixture';

test('synthetic private fixture chat uses deterministic model substitute', async ({ page, product }) => {
  await product.openChat();
  await product.sendFictionalMessage('Adult Mira visited a fictional lake.');
  await expect(page.getByText('What changed for you at the fictional lake?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New chat' })).toBeVisible();
});

test('discarded fictional draft is not presented as a saved story', async ({ page, product }) => {
  await product.openChat();
  await product.prepareFictionalDraft('Adult Mira visited a fictional lake.');
  await product.discardDraft();
  await expect(page.getByRole('button', { name: 'Approve and save story' })).toBeHidden();
});

test('approved fictional draft is searchable with an accessible source citation', async ({ page, product }) => {
  await product.openChat();
  await product.prepareFictionalDraft('Adult Mira walked beside a fictional lake because she felt calm.');
  await page.getByRole('textbox', { name: 'Story title' }).fill('Fictional Lake Note');
  await page.getByRole('textbox', { name: 'Story text' }).fill('Adult Mira walked beside a fictional lake because she felt calm.');
  await page.getByRole('button', { name: 'Approve and save story' }).click();
  await page.getByRole('checkbox', { name: 'Allow local search of my unlocked saved stories' }).check();
  await page.getByRole('textbox', { name: 'Search my saved stories' }).fill('lake');
  await page.getByRole('button', { name: 'Search saved stories' }).click();
  const citation = page.getByRole('button', { name: 'Open source: Fictional Lake Note' });
  await expect(citation).toBeVisible();
  await citation.click();
  await expect(page.getByRole('article').getByText('Adult Mira walked beside a fictional lake because she felt calm.', { exact: true })).toBeVisible();
});

test('fixture user B cannot find user A fictional source through local search', async ({ page, product }) => {
  await product.openChat();
  await product.prepareFictionalDraft('Adult Mira visited a fictional saffron meadow because she felt calm.');
  await page.getByRole('textbox', { name: 'Story title' }).fill('Fictional Saffron Meadow');
  await page.getByRole('textbox', { name: 'Story text' }).fill('Adult Mira visited a fictional saffron meadow because she felt calm.');
  await page.getByRole('button', { name: 'Approve and save story' }).click();
  await page.getByRole('button', { name: 'Fictional user B', exact: true }).click();
  await product.openChat();
  await page.getByRole('checkbox', { name: 'Allow local search of my unlocked saved stories' }).check();
  await page.getByRole('textbox', { name: 'Search my saved stories' }).fill('saffron meadow');
  await page.getByRole('button', { name: 'Search saved stories' }).click();
  await expect(page.getByRole('button', { name: 'Open source: Fictional Saffron Meadow' })).toHaveCount(0);
});
