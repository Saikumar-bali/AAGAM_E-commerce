import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
import { Page } from '@playwright/test';

export type QaRole = 'ADMIN' | 'CUSTOMER' | 'STORE_OWNER' | 'RIDER';

const EMAIL_ENV: Record<QaRole, string> = {
  ADMIN: process.env.QA_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@aagam.com',
  CUSTOMER: process.env.QA_CUSTOMER_EMAIL || process.env.CUSTOMER_EMAIL || 'customer@aagam.com',
  STORE_OWNER: process.env.QA_STORE_EMAIL || process.env.STORE_EMAIL || 'store@aagam.com',
  RIDER: process.env.QA_RIDER_EMAIL || process.env.RIDER_EMAIL || 'rider@aagam.com',
};

const PASSWORD_ENV: Record<QaRole, string> = {
  ADMIN: process.env.QA_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin@2026!',
  CUSTOMER: process.env.QA_CUSTOMER_PASSWORD || process.env.CUSTOMER_PASSWORD || 'customer@2026!',
  STORE_OWNER: process.env.QA_STORE_PASSWORD || process.env.STORE_PASSWORD || 'store@2026!',
  RIDER: process.env.QA_RIDER_PASSWORD || process.env.RIDER_PASSWORD || 'rider@2026!',
};

export function qaCredentials(role: QaRole) {
  return { email: EMAIL_ENV[role], password: PASSWORD_ENV[role] };
}

export async function loginWithCookieSession(page: Page, role: QaRole) {
  const { email, password } = qaCredentials(role);
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('user_role') !== null || localStorage.getItem('access_token') !== null, { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  const tokenInStorage = await page.evaluate(() => localStorage.getItem('access_token'));
  if (tokenInStorage === null) {
    throw new Error('Login did not persist access_token in localStorage');
  }
}
