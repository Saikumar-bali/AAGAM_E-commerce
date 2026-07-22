import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /live-inventory-production\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../../../docs/qa/live-inventory-ui/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../../docs/qa/live-inventory-ui/html-report', open: 'never' }],
    ['json', { outputFile: '../../../docs/qa/live-inventory-ui/results.json' }],
  ],
  use: {
    baseURL: process.env.LIVE_BASE_URL || 'https://aagam.accesscam.org',
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
  },
});
