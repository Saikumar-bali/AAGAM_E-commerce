import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve(__dirname, '../.auth/customer.json');

const EMAIL = process.env.QA_CUSTOMER_EMAIL || process.env.CUSTOMER_EMAIL || 'customer@aagam.com';
const PASSWORD = process.env.QA_CUSTOMER_PASSWORD || process.env.CUSTOMER_PASSWORD || 'customer@2026!';

setup('login as customer and save auth state', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /phone number or email/i }).fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForURL('**/shop**', { timeout: 20000 });
  await page.waitForLoadState('networkidle');

  // The browser session is carried only by the HttpOnly cookie. The role is
  // non-sensitive UI state and confirms that the login flow completed.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('user_role'))).not.toBeNull();

  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token');
  if (!sessionCookie?.httpOnly) throw new Error('HttpOnly session cookie was not created');

  await page.context().storageState({ path: AUTH_FILE });
});
