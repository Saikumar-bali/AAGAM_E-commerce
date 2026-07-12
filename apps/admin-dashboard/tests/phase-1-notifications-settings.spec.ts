import { expect, test } from '@playwright/test';
import path from 'path';
import { loginWithCookieSession, QaRole } from './helpers/login';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-1-notifications');

test.describe('Phase 1.1: event-level notification preferences', () => {
  test('all role settings pages render their relevant events', async ({ browser }) => {
    const cases: Array<{
      role: QaRole;
      route: string;
      heading: RegExp;
      event: string;
      screenshot: string;
    }> = [
      {
        role: 'ADMIN',
        route: '/admin/notifications/settings',
        heading: /Operations notification preferences/i,
        event: 'New order placed',
        screenshot: '06-admin-settings.png',
      },
      {
        role: 'CUSTOMER',
        route: '/shop/notifications/settings',
        heading: /Your notification preferences/i,
        event: 'Store accepted order',
        screenshot: '07-customer-settings.png',
      },
      {
        role: 'STORE_OWNER',
        route: '/store/notifications/settings',
        heading: /Store notification preferences/i,
        event: 'New order placed',
        screenshot: '08-store-settings.png',
      },
      {
        role: 'RIDER',
        route: '/rider/notifications/settings',
        heading: /Rider notification preferences/i,
        event: 'Delivery offer',
        screenshot: '09-rider-settings.png',
      },
    ];

    for (const item of cases) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginWithCookieSession(page, item.role);
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
    await loginWithCookieSession(page, 'CUSTOMER');
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
    await loginWithCookieSession(page, 'RIDER');
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
