import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /live-store-owner-w1-w7\.spec\.ts$/,
  timeout: 12 * 60_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../../../docs/qa/live-store-owner-w1-w7/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../../docs/qa/live-store-owner-w1-w7/html-report', open: 'never' }],
    ['json', { outputFile: '../../../docs/qa/live-store-owner-w1-w7/playwright-results.json' }],
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
