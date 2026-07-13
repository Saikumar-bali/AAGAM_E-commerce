import { defineConfig, devices } from "@playwright/test";

const AUTH_FILE = "./.auth/customer.json";

export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/global-setup.ts",
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3001",
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    launchOptions: {
      args: ["--font-render-hinting=none"],
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /phase-6-checkout-ux\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        storageState: AUTH_FILE,
      },
      dependencies: ["setup"],
      testMatch: /phase-6-checkout-ux\.spec\.ts/,
    },
    {
      name: "phase-0-dispatch",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
      },
      testMatch: /phase-0-dispatch-ui\.spec\.ts/,
    },
    {
      name: "phase-1-notifications",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        permissions: [],
      },
      testMatch:
        /phase-1-notifications(?:-ui|-e2e|-worker|-settings)?\.spec\.ts/,
    },
    {
      name: "phase-3-delivery-operations",
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
      },
      testMatch: /phase-3-delivery-operations-ui\.spec\.ts/,
    },
    {
      name: "phase-4-rider-portal",
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
      },
      testMatch: /phase-4-rider-portal-ui\.spec\.ts/,
    },
    {
      name: "phase-5-delivery-proof",
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
      },
      testMatch: /phase-5-delivery-proof-ui\.spec\.ts/,
    },
    {
      name: "phase-6b-promotions",
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
      },
      testMatch: /phase-6b-promotions-ui\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 3001,
    timeout: 120000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_API_URL: "http://localhost:3005",
    },
  },
});
