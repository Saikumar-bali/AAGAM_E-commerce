import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';

const USERS = [
  { email: 'admin@aagam.com', password: 'admin@2026!', role: 'ADMIN', expectedUrl: '/admin' },
  { email: 'customer@aagam.com', password: 'customer@2026!', role: 'CUSTOMER', expectedUrl: '/shop' },
  { email: 'store@aagam.com', password: 'store@2026!', role: 'STORE_OWNER', expectedUrl: '/store' },
  { email: 'rider@aagam.com', password: 'rider@2026!', role: 'RIDER', expectedUrl: '/rider' },
];

test.describe('Login All Roles - Local', () => {
  for (const user of USERS) {
    test(`login as ${user.role} (${user.email})`, async ({ page }) => {
      console.log(`\n[${user.role}] Testing login...`);
      
      await page.goto(`${BASE_URL}/login`);
      await page.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
      console.log(`[${user.role}] Login page loaded`);

      await page.fill('input[autocomplete="username"]', user.email);
      await page.fill('input[type="password"]', user.password);
      await page.click('button[type="submit"]');

      try {
        await page.waitForURL(`**${user.expectedUrl}**`, { timeout: 20000 });
        console.log(`[${user.role}] SUCCESS - Redirected to ${page.url()}`);
      } catch {
        console.log(`[${user.role}] FAILED - Current URL: ${page.url()}`);
        const bodyText = await page.textContent('body').catch(() => 'N/A');
        console.log(`[${user.role}] Page text (first 500): ${bodyText?.substring(0, 500)}`);
      }

      const cookies = await page.context().cookies();
      const token = cookies.find((c) => c.name === 'access_token');
      console.log(`[${user.role}] access_token cookie: ${token ? 'EXISTS' : 'MISSING'}`);
      if (token) {
        console.log(`[${user.role}] Cookie secure: ${token.secure}, sameSite: ${token.sameSite}, httpOnly: ${token.httpOnly}`);
      }

      expect(page.url()).toContain(user.expectedUrl);
      await page.waitForTimeout(2000);
    });
  }
});
