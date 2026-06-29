import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-4');
const API_BASE = 'https://aagam-api-production.up.railway.app';

async function waitForStyles(page: Page) {
  // Wait for network to settle
  await page.waitForLoadState('networkidle');
  // Wait for fonts to be ready
  await page.evaluate(() => document.fonts.ready);
  // Wait for Tailwind CSS to be applied (check body has computed styles)
  await page.waitForFunction(() => {
    const body = document.body;
    if (!body) return false;
    const cs = getComputedStyle(body);
    // Tailwind sets font-family on body; just check it's not empty
    return cs.fontFamily.length > 0 && cs.backgroundColor !== '';
  }, { timeout: 15000 });
  // Extra settle time for dev mode CSS hot-reload
  await page.waitForTimeout(3000);
}

async function setToken(page: Page, email: string, password: string) {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  const body = await res.json();
  // Must be on the app origin before we can access localStorage
  await page.goto('/login');
  await page.waitForSelector('input[placeholder="you@company.com"]', { timeout: 15000 });
  await page.evaluate((token) => {
    localStorage.setItem('access_token', token);
  }, body.access_token);
  return body.user;
}

test.describe('Phase 4 Smoke Tests', () => {

  test('01 - Login page (unauthenticated)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('text=Sign in to your workspace', { timeout: 15000 });
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login-page.png`, fullPage: true });
  });

  test('02 - Customer shop / product listing', async ({ page }) => {
    const user = await setToken(page, 'customer@aagam.com', 'Demo@123');
    expect(user.role).toBe('CUSTOMER');

    await page.goto('/shop');
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-customer-products-or-cart.png`, fullPage: true });
  });

  test('03 - Customer order tracking (authenticated)', async ({ page }) => {
    const user = await setToken(page, 'customer@aagam.com', 'Demo@123');
    expect(user.role).toBe('CUSTOMER');

    await page.goto('/shop/orders');
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-customer-checkout-or-order-tracking.png`, fullPage: true });
  });

  test('04 - Store owner orders (via API token)', async ({ page }) => {
    const user = await setToken(page, 'admin@aagam.com', 'Admin@123');
    expect(user.role).toBe('ADMIN');

    await page.goto('/store/orders');
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-store-owner-orders.png`, fullPage: true });
  });

  test('05 - Store owner login attempt (production not seeded)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('input[placeholder="you@company.com"]', { timeout: 15000 });
    await page.fill('input[placeholder="you@company.com"]', 'store@aagam.com');
    await page.fill('input[placeholder="Enter password"]', 'Demo@123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
    await waitForStyles(page);

    const url = page.url();
    const stillOnLogin = url.includes('/login');
    const errorVisible = await page.locator('text=Invalid credentials').isVisible().catch(() => false);

    if (stillOnLogin && errorVisible) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/05-store-owner-login-error.png`, fullPage: true });
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/05-store-owner-unexpected-success.png`, fullPage: true });
    }
  });

  test('06 - Admin orders page', async ({ page }) => {
    const user = await setToken(page, 'admin@aagam.com', 'Admin@123');
    expect(user.role).toBe('ADMIN');

    await page.goto('/admin/orders');
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-admin-orders.png`, fullPage: true });
  });

  test('07 - Admin force cancel modal', async ({ page }) => {
    const user = await setToken(page, 'admin@aagam.com', 'Admin@123');
    expect(user.role).toBe('ADMIN');

    await page.goto('/admin/orders');
    await waitForStyles(page);

    const eyeButton = page.locator('button:has(svg.lucide-eye)').first();
    if (await eyeButton.isVisible().catch(() => false)) {
      await eyeButton.click();
      await page.waitForTimeout(1500);
      await waitForStyles(page);

      const forceCancelBtn = page.locator('button:has-text("Force Cancel")');
      if (await forceCancelBtn.isVisible().catch(() => false)) {
        await forceCancelBtn.click();
        await page.waitForTimeout(1000);
        await waitForStyles(page);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/07-admin-force-cancel-modal.png`, fullPage: true });
      } else {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/07-admin-force-cancel-modal-unavailable.png`, fullPage: true });
      }
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/07-admin-force-cancel-modal-no-orders.png`, fullPage: true });
    }
  });

  test('08 - Admin reassign rider modal', async ({ page }) => {
    const user = await setToken(page, 'admin@aagam.com', 'Admin@123');
    expect(user.role).toBe('ADMIN');

    await page.goto('/admin/orders');
    await waitForStyles(page);

    const eyeButton = page.locator('button:has(svg.lucide-eye)').first();
    if (await eyeButton.isVisible().catch(() => false)) {
      await eyeButton.click();
      await page.waitForTimeout(1500);
      await waitForStyles(page);

      const reassignBtn = page.locator('button:has-text("Reassign Rider")');
      if (await reassignBtn.isVisible().catch(() => false)) {
        await reassignBtn.click();
        await page.waitForTimeout(3000);
        await waitForStyles(page);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/08-admin-reassign-rider-modal.png`, fullPage: true });
      } else {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/08-admin-reassign-rider-modal-unavailable.png`, fullPage: true });
      }
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/08-admin-reassign-rider-modal-no-orders.png`, fullPage: true });
    }
  });

  test('09 - Rider dashboard', async ({ page }) => {
    const user = await setToken(page, 'rider1@aagam.com', 'Demo@123');
    expect(user.role).toBe('RIDER');

    await page.goto('/rider');
    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-rider-dashboard.png`, fullPage: true });
  });

  test('10 - Rider out-for-delivery / delivered', async ({ page }) => {
    const user = await setToken(page, 'rider1@aagam.com', 'Demo@123');
    expect(user.role).toBe('RIDER');

    await page.goto('/rider');
    await waitForStyles(page);

    const hasActiveOrder = await page.locator('text=Active Delivery').isVisible().catch(() => false);
    if (hasActiveOrder) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/10-rider-out-for-delivery-or-delivered.png`, fullPage: true });
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/10-rider-dashboard-no-active.png`, fullPage: true });
    }
  });

});
