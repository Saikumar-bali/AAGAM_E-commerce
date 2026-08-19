import { test as setup } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '../.auth/store-owner.json');

setup('authenticate as store owner', async ({ page }) => {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: /phone number or email/i })
    .fill(process.env.STORE_OWNER_QA_EMAIL ?? 'store@aagam.com');
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.STORE_OWNER_QA_PASSWORD ?? 'store@2026!');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForURL('**/store**', { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  await page.context().storageState({ path: AUTH_FILE });
});
