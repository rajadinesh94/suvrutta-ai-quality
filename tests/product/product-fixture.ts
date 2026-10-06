import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { ProductPage } from '../adapters/product-page';

type Actor = 'A' | 'B';
type FixtureProvider = { prepare: (args: { page: Page; actor: Actor }) => Promise<void> };
type Fixtures = { product: ProductPage; syntheticActor: Actor };

async function prepareActor(page: Page, actor: Actor): Promise<void> {
  const modulePath = process.env.QUALITY_PRODUCT_FIXTURE_MODULE;
  if (modulePath) {
    if (!isAbsolute(modulePath)) throw new Error('QUALITY_PRODUCT_FIXTURE_MODULE must be an absolute path');
    const provider = await import(pathToFileURL(modulePath).href) as FixtureProvider;
    if (typeof provider.prepare !== 'function') throw new Error('Product fixture module must export prepare({page, actor})');
    await provider.prepare({ page, actor });
    return;
  }
  await page.goto('/');
  const adult = page.getByRole('checkbox', { name: 'I am 18 or older.' });
  if (await adult.isVisible()) {
    await adult.check();
    await page.getByRole('checkbox', { name: /^I have read the privacy notice/ }).check();
    await page.getByRole('button', { name: 'Continue to Suvrutta' }).click();
  }
  await page.getByRole('button', { name: `Fictional user ${actor}`, exact: true }).click();
}

export const test = base.extend<Fixtures>({
  syntheticActor: ['A', { option: true }],
  product: async ({ page, syntheticActor }, use) => {
    // Intercept before navigation; all non-loopback requests are blocked.
    const targetOrigin = new URL(process.env.QUALITY_PRODUCT_BASE_URL || 'http://127.0.0.1:4186').origin;
    const cors = { 'access-control-allow-origin': targetOrigin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-luna-consent' };
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === targetOrigin) return route.continue();
      return route.abort();
    });
    await page.route('http://127.0.0.1:4178/v1/luna/health', route => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200,
      contentType: 'application/json', headers: cors,
      body: JSON.stringify({ available: true, model: 'gpt-5.6-luna' }) }));
    await page.route('http://127.0.0.1:4178/v1/luna/chat', route => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200,
      contentType: 'application/json', headers: cors,
      body: JSON.stringify({ model: 'gpt-5.6-luna', reply: 'What changed for you at the fictional lake?' }) }));
    await prepareActor(page, syntheticActor);
    await use(new ProductPage(page));
  },
});
export { expect };
