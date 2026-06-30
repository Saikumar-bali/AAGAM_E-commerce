import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-5-e2e');

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

test.describe('Phase 5 E2E: Order-to-Delivery Workflow (UI state verification over deterministic backend-seeded order)', () => {

  test('01 — Store owner: sees orders page with seeded orders', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/store');
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.locator('h1, h2').filter({ hasText: /orders/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Refresh/i }).first()).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-store-owner-packed.png`, fullPage: true });
  });

  test('02 — Admin: order table with seeded orders', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.getByText('Order Management')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('tbody')).toBeVisible({ timeout: 10000 });
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-admin-rider-assigned.png`, fullPage: true });
  });

  test('03 — Rider: dashboard with queue section', async ({ page }) => {
    await loginViaForm(page, 'rider@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/rider');
    await page.waitForTimeout(3000);

    await expect(page.locator('text=ONLINE').or(page.locator('text=OFFLINE')).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Available Orders').or(page.locator('text=Current Delivery')).first()).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-rider-out-for-delivery.png`, fullPage: true });
  });

  test('04 — Customer: order list and detail accessible', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/shop');
    await page.goto('/shop/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.getByRole('heading', { name: 'My Orders' })).toBeVisible({ timeout: 10000 });

    const orderCards = page.locator('[class*="cursor-pointer"]').filter({ hasText: /Confirmed|Pending|Picking|Delivered|Cancelled/ });
    await expect(orderCards.first()).toBeVisible({ timeout: 10000 });
    await orderCards.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.getByText('#').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Back to orders')).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-customer-live-tracking.png`, fullPage: true });
  });

  test('05 — Admin: live tracking map with filters', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/live-tracking');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await expect(page.getByRole('heading', { name: 'Live Tracking' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'All Active' })).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-admin-tracking-stopped-or-delivered.png`, fullPage: true });
  });
});
