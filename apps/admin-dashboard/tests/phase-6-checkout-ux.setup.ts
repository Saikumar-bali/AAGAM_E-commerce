import { test as setup } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve(__dirname, '../.auth/customer.json');

const EMAIL = process.env.QA_CUSTOMER_EMAIL;
const PASSWORD = process.env.QA_CUSTOMER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error(
    'Missing required environment variables: QA_CUSTOMER_EMAIL and QA_CUSTOMER_PASSWORD. ' +
    'Set them before running Playwright setup.'
  );
}

setup('login as customer and save auth state', async ({ page }) => {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/shop**', { timeout: 20000 });
  await page.waitForLoadState('networkidle');

  // Wait for localStorage to be set
  await page.waitForFunction(() => {
    return localStorage.getItem('access_token') !== null;
  }, { timeout: 5000 });

  await page.context().storageState({ path: AUTH_FILE });
});
