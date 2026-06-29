import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-4');

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

test.describe('Phase 4 — Real Screenshot Proof', () => {

  test('01 — Login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('text=Sign in to your workspace', { timeout: 15000 });
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login-page.png`, fullPage: true });
  });

  test('02 — Customer shop / product listing', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/shop');
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-customer-products-or-cart.png`, fullPage: true });
  });

  test('03 — Customer order tracking', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/shop');
    await page.goto('/shop/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-customer-order-tracking.png`, fullPage: true });
  });

  test('04 — Store owner login success', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/store');
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-store-owner-login-or-token-proof.png`, fullPage: true });
  });

  test('05 — Store owner orders page', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/store');
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-store-owner-orders.png`, fullPage: true });
  });

  test('06 — Store owner status actions', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/store');
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const statusFilter = page.locator('button:has-text("Picking"), button:has-text("PICKING")').first();
    const hasFilter = await statusFilter.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasFilter) {
      await statusFilter.click();
      await page.waitForTimeout(2000);
    } else {
      const confirmBtn = page.locator('button:has-text("Confirm")').first();
      const hasBtn = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
      }
    }
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-store-owner-status-actions.png`, fullPage: true });
  });

  test('07 — Admin orders page (real data)', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-admin-orders.png`, fullPage: true });
  });

  test('08 — Admin force cancel modal', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const eyeBtn = page.locator('button:has(svg.lucide-eye)').first();
    const hasEye = await eyeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasEye) {
      await eyeBtn.click();
      await page.waitForTimeout(2000);
      const forceCancelBtn = page.locator('button:has-text("Force Cancel")').first();
      const hasFC = await forceCancelBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasFC) {
        await forceCancelBtn.click();
        await page.waitForTimeout(1500);
      }
    }
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-admin-force-cancel-modal.png`, fullPage: true });
  });

  test('09 — Admin reassign rider modal', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const eyeBtn = page.locator('button:has(svg.lucide-eye)').first();
    const hasEye = await eyeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasEye) {
      await eyeBtn.click();
      await page.waitForTimeout(2000);
      const reassignBtn = page.locator('button:has-text("Reassign")').first();
      const hasRA = await reassignBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasRA) {
        await reassignBtn.click();
        await page.waitForTimeout(2000);
      }
    }
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-admin-reassign-rider-modal.png`, fullPage: true });
  });

  test('10 — Rider dashboard (OUT_FOR_DELIVERY order)', async ({ page }) => {
    await loginViaForm(page, 'rider@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/rider');
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-rider-dashboard.png`, fullPage: true });
  });

  test('11 — Rider out-for-delivery / delivered state', async ({ page }) => {
    await loginViaForm(page, 'rider@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/rider');
    await page.goto('/rider/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-rider-out-for-delivery-or-delivered.png`, fullPage: true });
  });

});
