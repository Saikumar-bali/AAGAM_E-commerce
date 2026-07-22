import { defineConfig, devices } from '@playwright/test';

const AUTH_FILE = './.auth/customer.json';
const workers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '4', 10);

export default defineConfig({
  // Keep setup fixtures under tests/ while also executing product lifecycle
  // scenarios stored under e2e/. Explicit project patterns prevent unrelated
  // source files from being collected when the common root is used.
  testDir: '.',
  outputDir: '../../docs/qa/phase-4/playwright-test-results',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  workers,
  globalSetup: './tests/global-setup.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: '../../docs/qa/phase-4/playwright-results.json' }],
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
      testMatch: /[\\/]tests[\\/]phase-[68].*\.setup\.ts$/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
      testMatch: /[\\/](tests|e2e)[\\/].*\.spec\.ts$/,
      // This suite intentionally targets the deployed production URL and uses
      // protected QA credentials. The dedicated live config runs it separately.
      testIgnore: /[\\/]e2e[\\/]live-store-owner-w1-w7\.spec\.ts$/,
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
