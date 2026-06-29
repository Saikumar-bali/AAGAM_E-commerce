import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-5');

async function loginViaForm(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

async function waitForDashboard(page: Page, urlFragment: string, timeout = 20000) {
  await page.waitForURL(`**${urlFragment}**`, { timeout });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

async function waitForStyles(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}

test.describe('Phase 5 — Live Tracking Screenshots', () => {

  test('01 — Customer order list page', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/shop');
    await page.goto('/shop/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.getByRole('heading', { name: 'My Orders' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Refresh|Shop/ }).first()).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-customer-tracking-assigned.png`, fullPage: true });
  });

  test('02 — Admin live tracking page with map', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/live-tracking');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    await expect(page.getByRole('heading', { name: 'Live Tracking' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'All Active' })).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-admin-live-map.png`, fullPage: true });
  });

  test('03 — Admin orders page with order table', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.getByText('Order Management')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('tbody')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-admin-stale-location-state.png`, fullPage: true });
  });
});
