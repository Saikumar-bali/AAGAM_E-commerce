import { Page } from '@playwright/test';

export type QaRole = 'ADMIN' | 'CUSTOMER' | 'STORE_OWNER' | 'RIDER';

const EMAIL_ENV: Record<QaRole, string> = {
  ADMIN: 'QA_ADMIN_EMAIL',
  CUSTOMER: 'QA_CUSTOMER_EMAIL',
  STORE_OWNER: 'QA_STORE_EMAIL',
  RIDER: 'QA_RIDER_EMAIL',
};

const PASSWORD_ENV: Record<QaRole, string> = {
  ADMIN: 'QA_ADMIN_PASSWORD',
  CUSTOMER: 'QA_CUSTOMER_PASSWORD',
  STORE_OWNER: 'QA_STORE_PASSWORD',
  RIDER: 'QA_RIDER_PASSWORD',
};

export function qaCredentials(role: QaRole) {
  const email = process.env[EMAIL_ENV[role]];
  const password = process.env[PASSWORD_ENV[role]];
  if (!email || !password) {
    throw new Error(`Missing ${EMAIL_ENV[role]} or ${PASSWORD_ENV[role]} for Playwright`);
  }
  return { email, password };
}

export async function loginWithCookieSession(page: Page, role: QaRole) {
  const { email, password } = qaCredentials(role);
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('user_role') !== null, { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  const cookies = await page.context().cookies();
  if (!cookies.some((cookie) => cookie.name === 'access_token' && cookie.httpOnly)) {
    throw new Error('Expected HttpOnly access_token cookie after browser login');
  }

  const tokenInStorage = await page.evaluate(() => localStorage.getItem('access_token'));
  if (tokenInStorage !== null) {
    throw new Error('Browser login must not persist a bearer token in localStorage');
  }
}
