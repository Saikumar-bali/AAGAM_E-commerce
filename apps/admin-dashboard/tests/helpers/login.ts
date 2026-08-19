import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
import { Page } from '@playwright/test';

export type QaRole = 'ADMIN' | 'CUSTOMER' | 'STORE_OWNER' | 'RIDER';

const LOCAL_TEST_PASSWORD = 'Aagam-Local-Seed-Only-Change-Me!';

const EMAIL_ENV: Record<QaRole, string> = {
  ADMIN: process.env.QA_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@aagam.com',
  CUSTOMER: process.env.QA_CUSTOMER_EMAIL || process.env.CUSTOMER_EMAIL || 'customer@aagam.com',
  STORE_OWNER: process.env.QA_STORE_EMAIL || process.env.STORE_EMAIL || 'store@aagam.com',
  RIDER: process.env.QA_RIDER_EMAIL || process.env.RIDER_EMAIL || 'rider@aagam.com',
};

const PASSWORD_ENV: Record<QaRole, string> = {
  ADMIN: process.env.QA_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || LOCAL_TEST_PASSWORD,
  CUSTOMER: process.env.QA_CUSTOMER_PASSWORD || process.env.CUSTOMER_PASSWORD || LOCAL_TEST_PASSWORD,
  STORE_OWNER: process.env.QA_STORE_PASSWORD || process.env.STORE_PASSWORD || LOCAL_TEST_PASSWORD,
  RIDER: process.env.QA_RIDER_PASSWORD || process.env.RIDER_PASSWORD || LOCAL_TEST_PASSWORD,
};

export function qaCredentials(role: QaRole) {
  return { email: EMAIL_ENV[role], password: PASSWORD_ENV[role] };
}

export async function loginWithCookieSession(page: Page, role: QaRole) {
  const { email, password } = qaCredentials(role);
  await page.goto('/login');
  // Older deployments defaulted to phone mode; current deployments render
  // password login directly. Keep this optional for backward compatibility.
  const passwordTab = page.getByRole('button', { name: 'Password', exact: true });
  if (await passwordTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await passwordTab.click();
  }
  // Fill credentials using flexible selectors
  const emailInput = page.locator('input[autocomplete="username"], input[name="email"], input[placeholder*="email" i], input[placeholder*="phone" i]').first();
  await emailInput.waitFor({ timeout: 10000 });
  await emailInput.fill(email);
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  await passwordInput.fill(password);
  // Submit
  const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Sign in")').first();
  await submitBtn.click();
  await page.waitForFunction(() => localStorage.getItem('user_role') !== null, { timeout: 15000 });
  // The post-login landing page (e.g. /admin analytics) can keep loading slow
  // endpoints, so networkidle may never settle under load. Wait for the
  // redirect away from /login, then give the page a short bounded settle
  // instead of blocking the full test timeout.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token');
  if (!sessionCookie?.httpOnly) throw new Error('Login did not create an HttpOnly session cookie');
}
