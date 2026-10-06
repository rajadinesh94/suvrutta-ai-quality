import { resolve, join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
const runDir = resolve(process.env.QUALITY_RUN_DIR || 'reports/runs/browser-direct');
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, retries: 0, workers: 1,
  reporter: [['list'], ['json', { outputFile: join(runDir, 'playwright-results.json') }]],
  outputDir: join(runDir, 'artifacts'),
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { timeout: 20000 } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } }
  ],
  webServer: { command: 'node src/server.mjs', url: 'http://127.0.0.1:4175/health', reuseExistingServer: process.env.QUALITY_EXTERNAL_REFERENCE === '1', timeout: 10000 }
});
