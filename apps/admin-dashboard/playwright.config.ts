import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  globalSetup: './tests/global-setup.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: !!process.env.CI },
    },
  ],
  webServer: {
    command: 'npm run dev --silent',
    port: 3001,
    timeout: 120000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:3005',
    },
  },
});
