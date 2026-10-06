import { resolve, join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const target = process.env.QUALITY_PRODUCT_BASE_URL;
if (!target) throw new Error('Set QUALITY_PRODUCT_BASE_URL to an explicit loopback synthetic fixture target');
const url = new URL(target);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
  throw new Error('Actual-product fixture tests accept only a clean loopback URL');
}
const runDir = resolve(process.env.QUALITY_RUN_DIR || 'reports/runs/product-direct');
export default defineConfig({
  testDir: './tests/product', timeout: 45000, retries: 0, workers: 1,
  reporter: [['list'], ['json', { outputFile: join(runDir, 'playwright-results.json') }]],
  outputDir: join(runDir, 'artifacts'),
  use: { baseURL: url.origin, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'product-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'product-mobile-browser', use: { ...devices['iPhone 13'], browserName: 'chromium' } }
  ]
});
