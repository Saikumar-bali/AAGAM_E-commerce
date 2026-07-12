import { test as setup } from '@playwright/test';
import path from 'path';
import { loginWithCookieSession } from './helpers/login';

const AUTH_FILE = path.resolve(__dirname, '../.auth/customer.json');

setup('login as customer and save auth state', async ({ page }) => {
  await loginWithCookieSession(page, 'CUSTOMER');
  await page.waitForURL('**/shop**', { timeout: 20000 });
  await page.context().storageState({ path: AUTH_FILE });
});
