import { expect, Page, test } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-1-notifications');

function getPasswordForEmail(email: string): string {
  if (email.includes('admin')) return process.env.QA_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin@2026!';
  if (email.includes('store')) return process.env.QA_STORE_PASSWORD || process.env.STORE_PASSWORD || 'store@2026!';
  if (email.includes('rider')) return process.env.QA_RIDER_PASSWORD || process.env.RIDER_PASSWORD || 'rider@2026!';
  return process.env.QA_CUSTOMER_PASSWORD || process.env.CUSTOMER_PASSWORD || 'customer@2026!';
}

async function login(page: Page, email: string, password?: string) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password ?? getPasswordForEmail(email));
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('user_role') !== null, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function verifyNotificationCenter(page: Page, route: string, heading: RegExp, screenshotName: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Communication centre', { exact: false }).or(page.getByText('Communication center', { exact: false }))).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Failed to fetch');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${screenshotName}`, fullPage: true });
}

test.describe('Phase 1: Professional notification centers', () => {
  test('Admin notification center and broadcast form render', async ({ page }) => {
    await login(page, 'admin@aagam.com');
    await page.goto('/admin/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Admin Notifications/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Communication center', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Broadcast placeholder' })).toBeVisible();
    await expect(page.locator('button').filter({ hasText: /Validate/i })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Failed to fetch');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-admin-notifications.png`, fullPage: true });
  });

  test('Customer notification center renders with durable inbox controls', async ({ page }) => {
    await login(page, 'customer@aagam.com');
    await page.goto('/shop/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Notifications/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Unread', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Failed to fetch');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-customer-notifications.png`, fullPage: true });
  });

  test('Store notification center is available in navigation', async ({ page }) => {
    await login(page, 'store@aagam.com');
    await verifyNotificationCenter(page, '/store/notifications', /Store Notifications/i, '03-store-notifications.png');
  });

  test('Rider notification center is addressed-offer focused', async ({ page }) => {
    await login(page, 'rider@aagam.com');
    await verifyNotificationCenter(page, '/rider/notifications', /Notifications/i, '04-rider-notifications.png');
    await expect(page.getByText(/delivery offers addressed to you/i)).toBeVisible();
  });

  test('Notification centers have no mobile horizontal overflow', async ({ page }) => {
    await login(page, 'rider@aagam.com');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/rider/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-rider-mobile.png`, fullPage: true });
  });
});
