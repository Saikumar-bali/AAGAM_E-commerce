import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
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

  test('06 — Store owner status actions (strict)', async ({ page }) => {
    await loginViaForm(page, 'store@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/store');
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // qa-order-1 is seeded as PICKING — find the card containing the "Picking" badge
    const pickingBadge = page.locator('span:has-text("Picking")').first();
    await expect(pickingBadge).toBeVisible({ timeout: 10000 });

    // Scope to the enterprise-card that contains the Picking badge
    const pickingCard = page.locator('.enterprise-card').filter({ has: pickingBadge });
    await expect(pickingCard).toBeVisible({ timeout: 5000 });

    // The "Mark Packed" button MUST be in this card
    const markPackedBtn = pickingCard.locator('button:has-text("Mark Packed")').first();
    await expect(markPackedBtn).toBeVisible({ timeout: 10000 });

    await markPackedBtn.click();
    await page.waitForTimeout(3000);

    // After clicking, reload to get fresh state and verify the order is now PACKED
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // The order that was PICKING must now show "Packed" badge — assert no "Picking" badge remains
    const pickingBadgeAfter = page.locator('span:has-text("Picking")').first();
    const anyPicking = await pickingBadgeAfter.isVisible({ timeout: 3000 }).catch(() => false);
    expect(anyPicking).toBe(false);

    // At least one "Packed" badge must exist (qa-order-1 is now PACKED)
    const packedBadge = page.locator('span:has-text("Packed")').first();
    await expect(packedBadge).toBeVisible({ timeout: 5000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-store-owner-status-actions.png`, fullPage: true });
  });

  test('07 — Admin orders page (real data)', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const orderHeading = page.locator('h1:has-text("Order Management")');
    await expect(orderHeading).toBeVisible({ timeout: 10000 });

    const orderRows = page.locator('tbody tr');
    const rowCount = await orderRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-admin-orders.png`, fullPage: true });
  });

  test('08 — Admin force cancel modal', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
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

  test('09 — Admin reassign rider modal', async ({ page }) => {
    await loginViaForm(page, 'admin@aagam.com', 'Admin@123');
    await waitForDashboard(page, '/admin');
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await openOrderDetail(page);

    const orderDetailModal = page.locator('text=Order Details');
    await expect(orderDetailModal).toBeVisible({ timeout: 5000 });

    const reassignBtn = page.locator('button:has-text("Reassign Rider")').first();
    await expect(reassignBtn).toBeVisible({ timeout: 5000 });
    await reassignBtn.click();
    await page.waitForTimeout(2000);

    const raModalTitle = page.locator('h2:has-text("Reassign Rider")');
    await expect(raModalTitle).toBeVisible({ timeout: 5000 });

    const riderSelect = page.locator('select').filter({ hasText: 'Select a rider' });
    await expect(riderSelect).toBeVisible({ timeout: 3000 });

    const confirmBtn = page.locator('button:has-text("Confirm Reassign")');
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-admin-reassign-rider-modal.png`, fullPage: true });
  });

  test('10 — Rider dashboard (active delivery queue)', async ({ page }) => {
    await loginViaForm(page, 'rider@aagam.com', 'Demo@123');
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

  test('11 — Rider delivery state (strict — picks available order)', async ({ page }) => {
    await loginViaForm(page, 'rider@aagam.com', 'Demo@123');
    await waitForDashboard(page, '/rider');

    // "Delivery Queue" heading MUST exist
    const deliveryQueue = page.locator('h1:has-text("Delivery Queue")');
    await expect(deliveryQueue).toBeVisible({ timeout: 10000 });

    // qa-order-rider-pick is seeded as CONFIRMED, unassigned — "Pick" button MUST exist
    const pickBtn = page.locator('button:has-text("Pick")').first();
    await expect(pickBtn).toBeVisible({ timeout: 15000 });

    // Scroll to the Pick button and click it
    await pickBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await pickBtn.click();

    // Wait for the API call to complete
    await page.waitForTimeout(5000);

    // Reload page to get fresh state from server
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // After picking, the order is RIDER_ASSIGNED — no longer in the unassigned queue
    // "Pick" button should NOT exist for any order
    const pickBtnAfter = page.locator('button:has-text("Pick")').first();
    const anyPickBtn = await pickBtnAfter.isVisible({ timeout: 5000 }).catch(() => false);
    expect(anyPickBtn).toBe(false);

    // The queue should show "No active orders" since all CONFIRMED orders have been picked
    const noActive = page.locator('text=No active orders');
    await expect(noActive).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-rider-out-for-delivery-or-delivered.png`, fullPage: true });
  });

});
