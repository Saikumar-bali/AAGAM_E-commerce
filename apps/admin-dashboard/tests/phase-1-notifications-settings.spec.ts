import { expect, Page, test } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-1-notifications');

const PASSWORDS: Record<string, string> = {
  'admin@aagam.com': 'admin@2026!',
  'customer@aagam.com': 'customer@2026!',
  'store@aagam.com': 'store@2026!',
  'store2@aagam.com': 'store@2026!',
  'rider@aagam.com': 'rider@2026!',
  'rider1@aagam.com': 'rider@2026!',
  'rider2@aagam.com': 'rider@2026!',
};

async function login(page: Page, email: string, password = PASSWORDS[email] || 'Test@1234') {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('access_token') !== null, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Phase 1.1: event-level notification preferences', () => {
  test('all role settings pages render their relevant events', async ({ browser }) => {
    const cases = [
      {
        email: 'admin@aagam.com',
        route: '/admin/notifications/settings',
        heading: /Operations notification preferences/i,
        event: 'New order placed',
        screenshot: '06-admin-settings.png',
      },
      {
        email: 'customer@aagam.com',
        route: '/shop/notifications/settings',
        heading: /Your notification preferences/i,
        event: 'Store accepted order',
        screenshot: '07-customer-settings.png',
      },
      {
        email: 'store@aagam.com',
        route: '/store/notifications/settings',
        heading: /Store notification preferences/i,
        event: 'New order placed',
        screenshot: '08-store-settings.png',
      },
      {
        email: 'rider@aagam.com',
        route: '/rider/notifications/settings',
        heading: /Rider notification preferences/i,
        event: 'Delivery offer',
        screenshot: '09-rider-settings.png',
      },
    ];

    for (const item of cases) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, item.email);
      await page.goto(item.route);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: item.heading })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('heading', { name: 'Global defaults' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Event-specific controls' })).toBeVisible();
      await expect(page.getByRole('heading', { name: item.event, exact: true })).toBeVisible();
      await expect(page.getByRole('switch', { name: /Global device push/i })).toBeVisible();
      await expect(page.getByRole('switch', { name: /Global in-app inbox/i })).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Could not load notification preferences');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${item.screenshot}`, fullPage: true });

      await context.close();
    }
  });

  test('customer can persist and restore the global push preference', async ({ page }) => {
    await login(page, 'customer@aagam.com');
    await page.goto('/shop/notifications/settings');
    await page.waitForLoadState('networkidle');

    const toggle = page.getByRole('switch', { name: 'Global device push' });
    await expect(toggle).toBeVisible({ timeout: 15000 });
    const original = await toggle.getAttribute('aria-checked');

    await toggle.click();
    await expect(page.getByText('Global notification preference saved.')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', original === 'true' ? 'false' : 'true');

    await toggle.click();
    await expect(page.getByText('Global notification preference saved.')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', original || 'true');
  });

  test('rider settings remain usable at mobile width', async ({ page }) => {
    await login(page, 'rider@aagam.com');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/rider/notifications/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Rider notification preferences/i })).toBeVisible({ timeout: 15000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-rider-settings-mobile.png`, fullPage: true });
  });
});
