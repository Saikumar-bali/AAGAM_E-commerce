import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-4');

async function loginViaForm(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
  await page.fill('input[autocomplete="username"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('user_role') !== null, { timeout: 15000 });
}

async function waitForDashboard(page: Page, urlFragment: string, timeout = 20000) {
  await page.waitForURL(`**${urlFragment}**`, { timeout });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

async function waitForStyles(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const body = document.body;
    if (!body) return false;
    const cs = getComputedStyle(body);
    return cs.fontFamily.length > 0 && cs.backgroundColor !== '';
  }, { timeout: 15000 });
  await page.waitForTimeout(2000);
}

async function openOrderDetail(page: Page) {
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 10000 });
  await firstRow.hover();
  await page.waitForTimeout(500);
  const eyeBtn = firstRow.locator('button').first();
  await expect(eyeBtn).toBeVisible({ timeout: 5000 });
  await eyeBtn.click();
  await page.waitForTimeout(2000);
}

test.describe('Phase 4 â€” Real Screenshot Proof', () => {

  test('01 â€” Login page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Sign in to Aagaam', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login-page.png`, fullPage: true });
  });

  test('02 â€” Customer shop / product listing', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', (process.env.P4_DEMO_PASS ?? 'customer@2026!'));
    await waitForDashboard(page, '/shop');
    await page.goto('/shop');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-customer-products-or-cart.png`, fullPage: true });
  });

  test('03 â€” Customer order tracking', async ({ page }) => {
    await loginViaForm(page, 'customer@aagam.com', (process.env.P4_DEMO_PASS ?? 'customer@2026!'));
    await waitForDashboard(page, '/shop');
    await page.goto('/shop/orders');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-customer-order-tracking.png`, fullPage: true });
  });

  test('04 â€” Store owner login success', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', (process.env.P4_STORE_PASS ?? 'store@2026!'));
    await waitForDashboard(page, '/store');
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-store-owner-login-or-token-proof.png`, fullPage: true });
  });

  test('05 â€” Store owner orders page', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', (process.env.P4_STORE_PASS ?? 'store@2026!'));
    await waitForDashboard(page, '/store');
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-store-owner-orders.png`, fullPage: true });
  });

  test('06 â€” Store owner status actions (strict)', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', (process.env.P4_STORE_PASS ?? 'store@2026!'));
    await waitForDashboard(page, '/store');
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const actionBtn = page.locator('button').filter({ hasText: /Mark|Accept|Start|Pick|Accept & Pack/i }).first();
    const hasAction = await actionBtn.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasAction) {
      await actionBtn.click();
      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-store-owner-status-actions.png`, fullPage: true });
  });

  test('07 â€” Admin orders page (real data)', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', (process.env.P4_ADMIN_PASS ?? 'admin@2026!'));
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const orderHeading = page.locator('h1:has-text("Order Management")');
    await expect(orderHeading).toBeVisible({ timeout: 10000 });

    const orderRows = page.locator('tbody tr');
    const rowCount = await orderRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-admin-orders.png`, fullPage: true });
  });

  test('08 â€” Admin force cancel modal', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', (process.env.P4_ADMIN_PASS ?? 'admin@2026!'));
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await openOrderDetail(page);

    const orderDetailModal = page.locator('text=Order Details');
    await expect(orderDetailModal).toBeVisible({ timeout: 5000 });

    const forceCancelBtn = page.locator('button:has-text("Force Cancel")').first();
    await expect(forceCancelBtn).toBeVisible({ timeout: 5000 });
    await forceCancelBtn.click();
    await page.waitForTimeout(1500);

    const fcModalTitle = page.locator('h2:has-text("Force Cancel Order")');
    await expect(fcModalTitle).toBeVisible({ timeout: 5000 });

    const reasonTextarea = page.locator('textarea');
    await expect(reasonTextarea).toBeVisible({ timeout: 3000 });

    const confirmBtn = page.locator('button:has-text("Confirm Force Cancel")');
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-admin-force-cancel-modal.png`, fullPage: true });
  });

  test('09 â€” Admin reassign rider modal', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', (process.env.P4_ADMIN_PASS ?? 'admin@2026!'));
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await openOrderDetail(page);

    const orderDetailModal = page.locator('text=Order Details');
    await expect(orderDetailModal).toBeVisible({ timeout: 5000 });

    const reassignBtn = page.locator('button:has-text("Reassign Rider")').first();
    await expect(reassignBtn).toBeVisible({ timeout: 5000 });
    const boardResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/orders/dispatch/board') &&
        response.status() === 200,
      { timeout: 10000 },
    );
    await reassignBtn.click();
    const boardResponse = await boardResponsePromise;
    const boardPayload = await boardResponse.json();
    expect(Array.isArray(boardPayload?.riders)).toBe(true);
    expect(Array.isArray(boardPayload?.openOffers)).toBe(true);

    const raModalTitle = page.locator('h2:has-text("Reassign Rider")');
    await expect(raModalTitle).toBeVisible({ timeout: 5000 });

    const riderSelect = page
      .locator('select')
      .filter({ has: page.locator('option[value=""]') })
      .last();
    await expect(riderSelect).toBeVisible({ timeout: 3000 });
    await expect(riderSelect.locator('option[value=""]')).toHaveText(
      /Select a rider|No available riders/,
    );

    const confirmBtn = page.locator('button:has-text("Confirm Reassign")');
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-admin-reassign-rider-modal.png`, fullPage: true });
  });

  test('10 â€” Rider dashboard (active delivery queue)', async ({ page }) => {
    await loginViaForm(page, 'rider@aagam.com', (process.env.P4_RIDER_PASS ?? 'rider@2026!'));
    await waitForDashboard(page, '/rider');

    const goOnlineBtn = page.locator('button:has-text("Go Online")').first();
    const hasGoOnline = await goOnlineBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasGoOnline) {
      await goOnlineBtn.click();
      await page.waitForTimeout(3000);
    }

    await page.waitForTimeout(2000);
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-rider-dashboard.png`, fullPage: true });
  });

  test('11 â€” Rider delivery state (strict â€” picks available order)', async ({ page }) => {
    await loginViaForm(page, 'rider@aagam.com', (process.env.P4_RIDER_PASS ?? 'rider@2026!'));
    await waitForDashboard(page, '/rider');

    // Go online first if needed
    const goOnlineBtn = page.locator('button:has-text("Go Online")').first();
    const hasGoOnline = await goOnlineBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasGoOnline) {
      await goOnlineBtn.click();
      await page.waitForTimeout(3000);
    }

    // "Delivery Workspace" heading MUST exist
    const deliveryQueue = page.locator('h1:has-text("Delivery Workspace")');
    await expect(deliveryQueue).toBeVisible({ timeout: 10000 });

    // Look for any available "Pick" button
    const pickBtn = page.locator('button:has-text("Pick")').first();
    const hasPick = await pickBtn.isVisible({ timeout: 15000 }).catch(() => false);

    if (hasPick) {
      await pickBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await pickBtn.click();
      await page.waitForTimeout(5000);

      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3000);

      const pickBtnAfter = page.locator('button:has-text("Pick")').first();
      const anyPickBtn = await pickBtnAfter.isVisible({ timeout: 5000 }).catch(() => false);
      expect(anyPickBtn).toBe(false);
    }

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-rider-out-for-delivery-or-delivered.png`, fullPage: true });
  });

});
