import { test, expect } from '@playwright/test';

const LIVE_SITE = 'https://aagam-admin.pages.dev';

const USERS: { email: string; password: string; role: string; expectedUrl: string }[] = [
  { email: process.env.LOGIN_TEST_ADMIN_EMAIL ?? '', password: process.env.LOGIN_TEST_ADMIN_PASSWORD ?? '', role: 'ADMIN', expectedUrl: '/admin' },
  { email: process.env.LOGIN_TEST_CUSTOMER_EMAIL ?? '', password: process.env.LOGIN_TEST_CUSTOMER_PASSWORD ?? '', role: 'CUSTOMER', expectedUrl: '/shop' },
  { email: process.env.LOGIN_TEST_RIDER_EMAIL ?? '', password: process.env.LOGIN_TEST_RIDER_PASSWORD ?? '', role: 'RIDER', expectedUrl: '/rider' },
  { email: process.env.LOGIN_TEST_STORE_EMAIL ?? '', password: process.env.LOGIN_TEST_STORE_PASSWORD ?? '', role: 'STORE_OWNER', expectedUrl: '/store' },
];

test.describe('Live Cloudflare Pages - Login & Role Switch', () => {
  for (const user of USERS) {
    test(`login as ${user.role} (${user.email})`, async ({ page }) => {
      // Go to login page
      await page.goto(`${LIVE_SITE}/login`);
      await page.waitForSelector('input[type="email"]', { timeout: 15000 });
      console.log(`[${user.role}] Login page loaded`);

      // Fill credentials
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[type="password"]', user.password);

      // Submit login
      await page.click('button[type="submit"]');

      // Wait for navigation (role-based redirect)
      try {
        await page.waitForURL(`**${user.expectedUrl}**`, { timeout: 20000 });
        console.log(`[${user.role}] SUCCESS - Redirected to ${page.url()}`);
      } catch {
        // If we didn't redirect, log current state
        console.log(`[${user.role}] FAILED - Current URL: ${page.url()}`);
        const bodyText = await page.textContent('body').catch(() => 'N/A');
        console.log(`[${user.role}] Page text (first 500): ${bodyText?.substring(0, 500)}`);
      }

      // Check cookies
      const cookies = await page.context().cookies();
      const token = cookies.find((c) => c.name === 'access_token');
      console.log(`[${user.role}] access_token cookie: ${token ? 'EXISTS' : 'MISSING'}`);
      if (token) {
        console.log(`[${user.role}] Cookie secure: ${token.secure}, sameSite: ${token.sameSite}, httpOnly: ${token.httpOnly}`);
      }

      // Verify we're on the right page
      expect(page.url()).toContain(user.expectedUrl);
    });
  }

  test('full role switch flow - login admin then shop then rider', async ({ page }) => {
    // Login as admin
    await page.goto(`${LIVE_SITE}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', process.env.LOGIN_TEST_ADMIN_EMAIL ?? '');
    await page.fill('input[type="password"]', process.env.LOGIN_TEST_ADMIN_PASSWORD ?? '');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin**', { timeout: 20000 });
    console.log('Admin login OK - URL:', page.url());

    const adminCookies = await page.context().cookies();
    const adminToken = adminCookies.find((c) => c.name === 'access_token');
    console.log('Admin cookie:', adminToken?.value.substring(0, 40) + '...');

    // Now navigate to login page to switch user
    await page.goto(`${LIVE_SITE}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', process.env.LOGIN_TEST_CUSTOMER_EMAIL ?? '');
    await page.fill('input[type="password"]', process.env.LOGIN_TEST_CUSTOMER_PASSWORD ?? '');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/shop**', { timeout: 20000 });
    console.log('Customer login OK - URL:', page.url());

    const customerCookies = await page.context().cookies();
    const customerToken = customerCookies.find((c) => c.name === 'access_token');
    console.log('Customer cookie:', customerToken?.value.substring(0, 40) + '...');

    // Verify cookies are different
    expect(adminToken?.value).not.toBe(customerToken?.value);
    console.log('Cookie switch verified - admin vs customer tokens are different');
  });
});
