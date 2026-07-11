import { expect, Page, test } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-1-notifications');

async function login(page: Page, email: string, password = 'Test@1234') {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
}

async function verifyNotificationCenter(page: Page, route: string, heading: RegExp, screenshotName: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Enable background alerts|Background alerts on/i })).toBeVisible();
  await expect(page.getByText('Unread', { exact: true })).toBeVisible();
  await expect(page.getByText('Last 24 hours', { exact: true })).toBeVisible();
  await expect(page.getByText('Device delivery', { exact: true })).toBeVisible();
  await expect(page.getByText('Push preference', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Failed to fetch');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${screenshotName}`, fullPage: true });
}

test.describe('Phase 1: Professional notification centers', () => {
  test('Admin notification center and broadcast form render', async ({ page }) => {
    await login(page, 'admin@aagam.com');
    await verifyNotificationCenter(page, '/admin/notifications', /Operations Notifications/i, '01-admin-notifications.png');
    await expect(page.getByRole('heading', { name: /Operations broadcast/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Queue/i })).toBeVisible();
    await expect(page.getByText('All users')).toBeVisible();
  });

  test('Customer notification center renders with durable inbox controls', async ({ page }) => {
    await login(page, 'customer@aagam.com');
    await verifyNotificationCenter(page, '/shop/notifications', /Your Notifications/i, '02-customer-notifications.png');
  });

  test('Store notification center is available in navigation', async ({ page }) => {
    await login(page, 'store@aagam.com');
    await verifyNotificationCenter(page, '/store/notifications', /Store Notifications/i, '03-store-notifications.png');
    await expect(page.getByRole('link', { name: /Notifications/i }).first()).toBeVisible();
  });

  test('Rider notification center is addressed-offer focused', async ({ page }) => {
    await login(page, 'rider@aagam.com');
    await verifyNotificationCenter(page, '/rider/notifications', /Rider Notifications/i, '04-rider-notifications.png');
    await expect(page.getByText(/Only delivery offers addressed to you/i)).toBeVisible();
  });

  test('Notification centers have no mobile horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'rider@aagam.com');
    await page.goto('/rider/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-rider-mobile.png`, fullPage: true });
  });
});
