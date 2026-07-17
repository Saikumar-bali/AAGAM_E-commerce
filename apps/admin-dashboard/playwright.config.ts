import { defineConfig, devices } from '@playwright/test';

const AUTH_FILE = './.auth/customer.json';
const workers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '4', 10);

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  workers,
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
      name: 'setup',
      testMatch: /phase-[68].*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts$/,
    },
  ],
  webServer: {
    // CI already creates a production build. Serving that immutable build keeps
    // four concurrent workers away from Next.js Fast Refresh/compiler races.
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    port: 3001,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:3005',
    },
  },
});
