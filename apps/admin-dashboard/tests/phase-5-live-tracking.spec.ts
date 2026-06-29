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
  await page.waitForTimeout(3000);
}

async function waitForStyles(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const body = document.body;
    if (!body) return false;
    const cs = getComputedStyle(body);
    return cs.fontFamily.length > 0 && cs.backgroundColor !== '';
  }, { timeout: 15000 });
  await page.waitForTimeout(2000);
}

test.describe('Phase 5 — Live Tracking Screenshots', () => {

  test('01 — Customer tracking page with map', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/shop');
    await page.goto('/shop/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const firstOrder = page.locator('a[href*="/shop/orders/"]').first();
    if (await firstOrder.isVisible()) {
      await firstOrder.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000);
    }

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-customer-tracking-assigned.png`, fullPage: true });
  });

  test('02 — Admin live tracking page', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/live-tracking');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-admin-live-map.png`, fullPage: true });
  });

  test('03 — Admin live tracking with order detail', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/live-tracking');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const orderItem = page.locator('[class*="cursor-pointer"]').first();
    if (await orderItem.isVisible()) {
      await orderItem.click();
      await page.waitForTimeout(2000);
    }

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-admin-live-order-detail.png`, fullPage: true });
  });

  test('04 — Admin orders page with tracking', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-admin-stale-location-state.png`, fullPage: true });
  });

  test('05 — Customer order list', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/shop');
    await page.goto('/shop/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-customer-tracking-delivered-or-stopped.png`, fullPage: true });
  });
});
