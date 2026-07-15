import { test as setup } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '../.auth/store-owner.json');

setup('authenticate as store owner', async ({ page }) => {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', 'store-owner-qa@aagam.com');
  await page.fill('input[type="password"]', 'Store@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/store**', { timeout: 20000 });
  await page.waitForLoadState('networkidle');

  await page.context().storageState({ path: AUTH_FILE });
});
