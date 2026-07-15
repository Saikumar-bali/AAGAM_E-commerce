import { defineConfig, devices } from '@playwright/test';

const AUTH_FILE = './.auth/store-owner.json';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-phase8b' }],
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--font-render-hinting=none'],
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /phase-8b-checkout-ux\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
      testMatch: /phase-8b-store-fulfillment\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3001,
    timeout: 120000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:3005',
    },
  },
});
