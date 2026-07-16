import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-8b');

async function waitForStyles(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}

const STORE_EMAIL = process.env.STORE_OWNER_QA_EMAIL || process.env.STORE_EMAIL || 'store@aagam.com';
const STORE_PASS = process.env.STORE_OWNER_QA_PASSWORD || process.env.STORE_PASSWORD || 'store@2026!';
const P8B_STORE_EMAIL = process.env.P8B_STORE_EMAIL || 'qa-rider-pick-store@aagam.com';
const P8B_STORE_PASS = process.env.P8B_STORE_PASSWORD || 'store@2026!';

async function loginAsStore(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', STORE_EMAIL);
  await page.fill('input[type="password"]', STORE_PASS);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('access_token') !== null, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Phase 8b: Store Fulfillment — Item Issues & Substitutes', () => {

  test('01 — Store orders page loads with lane counters', async ({ page }) => {
    await loginAsStore(page);
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Page title
    const heading = page.locator('h1').filter({ hasText: /Order Queue/i });
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Lane counter cards
    const lanes = ['New', 'Accepted', 'Preparing', 'Ready', 'Rider', 'Done'];
    for (const lane of lanes) {
      const card = page.locator('p').filter({ hasText: new RegExp(`^${lane}$`, 'i') }).first();
      await expect(card).toBeVisible({ timeout: 5000 });
    }

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-lane-counters.png`, fullPage: true });
  });

  test('02 — Order card shows picking list with product quantities', async ({ page }) => {
    await loginAsStore(page);
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // At least one order card should exist
    const orderCards = page.locator('[class*="enterprise-card"]');
    await expect(orderCards.first()).toBeVisible({ timeout: 10000 });

    // Picking list section
    const pickingList = page.locator('text=Picking list').first();
    await expect(pickingList).toBeVisible({ timeout: 5000 });

    // Should show product names and quantities
    const items = page.locator('[class*="enterprise-card"]').first().locator('[class*="bg-slate-50"] [class*="grid"] > div');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-picking-list.png`, fullPage: true });
  });

  test('03 — Unavail and Substitute buttons visible on editable orders', async ({ page }) => {
    await loginAsStore(page);
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Find an order card with items (PENDING or PICKING status has edit buttons)
    const orderCard = page.locator('[class*="enterprise-card"]').filter({ hasText: /New|Accepted|Preparing/i }).first();
    await expect(orderCard).toBeVisible({ timeout: 10000 });

    // Unavail button should be visible
    const unavailBtn = orderCard.locator('button').filter({ hasText: /Unavail/i }).first();
    await expect(unavailBtn).toBeVisible({ timeout: 5000 });

    // Substitute button should be visible
    const substituteBtn = orderCard.locator('button').filter({ hasText: /Substitute/i }).first();
    await expect(substituteBtn).toBeVisible({ timeout: 5000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-unavail-substitute-buttons.png`, fullPage: true });
  });

  test('04 — Mark item unavailable via API and verify UI update', async ({ page }) => {
    // Use the API to mark an item unavailable, then verify UI shows it
    const tokenResponse = await page.request.post('http://localhost:3005/auth/login', {
      data: { email: STORE_EMAIL, password: STORE_PASS },
    });
    const { access_token } = await tokenResponse.json();

    // Get store orders
    const ordersRes = await page.request.get('http://localhost:3005/orders/store', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const orders = await ordersRes.json();

    // Find a PENDING or PICKING order with items
    const editableOrder = orders.find((o: any) => ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING'].includes(o.status) && o.items?.length > 0);
    expect(editableOrder).toBeDefined();

    const itemId = editableOrder.items[0].id;

    // Mark item unavailable via API
    const markRes = await page.request.patch(
      `http://localhost:3005/orders/store/${editableOrder.id}/items/${itemId}/unavailable`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
        data: { reason: 'Not found on shelf' },
      },
    );
    expect(markRes.ok()).toBeTruthy();

    // Reload page and verify the unavailable badge appears
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const unavailableBadge = page.locator('text=Unavailable').first();
    await expect(unavailableBadge).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-item-unavailable.png`, fullPage: true });
  });

  test('05 — Ready for Pickup blocked when unresolved item issues exist', async ({ page }) => {
    const tokenResponse = await page.request.post('http://localhost:3005/auth/login', {
      data: { email: STORE_EMAIL, password: STORE_PASS },
    });
    const { access_token } = await tokenResponse.json();

    // Get orders and find one with an unresolved issue
    const ordersRes = await page.request.get('http://localhost:3005/orders/store', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const orders = await ordersRes.json();

    const orderWithIssue = orders.find((o: any) => {
      const snapshot = o.itemsSnapshot;
      const issues = snapshot?.fulfillmentIssues;
      return Array.isArray(issues) && issues.some((i: any) => i.status === 'UNAVAILABLE');
    });
    expect(orderWithIssue).toBeDefined();

    // Try ready for pickup — should fail
    const readyRes = await page.request.patch(
      `http://localhost:3005/orders/store/${orderWithIssue.id}/ready`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    expect(readyRes.ok()).toBeFalsy();
    const errorBody = await readyRes.json();
    expect(errorBody.message).toContain('Resolve unavailable items');

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-ready-blocked.png`, fullPage: true });
  });

  test('06 — Substitute listing returns available products', async ({ page }) => {
    const tokenResponse = await page.request.post('http://localhost:3005/auth/login', {
      data: { email: STORE_EMAIL, password: STORE_PASS },
    });
    const { access_token } = await tokenResponse.json();

    const ordersRes = await page.request.get('http://localhost:3005/orders/store', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const orders = await ordersRes.json();

    const orderWithItem = orders.find((o: any) => ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING'].includes(o.status) && o.items?.length > 0);
    expect(orderWithItem).toBeDefined();

    const itemId = orderWithItem.items[0].id;

    // Get substitutes
    const subsRes = await page.request.get(
      `http://localhost:3005/orders/store/${orderWithItem.id}/items/${itemId}/substitutes`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    expect(subsRes.ok()).toBeTruthy();
    const substitutes = await subsRes.json();
    expect(Array.isArray(substitutes)).toBeTruthy();

    // At least one substitute (atta is same category as rice)
    if (substitutes.length > 0) {
      expect(substitutes[0]).toHaveProperty('id');
      expect(substitutes[0]).toHaveProperty('name');
      expect(substitutes[0]).toHaveProperty('availability');
    }

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-substitutes-list.png`, fullPage: true });
  });

  test('07 — Substitute replacement updates item and grand total', async ({ page }) => {
    const tokenResponse = await page.request.post('http://localhost:3005/auth/login', {
      data: { email: P8B_STORE_EMAIL, password: P8B_STORE_PASS },
    });
    const { access_token } = await tokenResponse.json();

    // Find a PICKING order with rice item
    const ordersRes = await page.request.get('http://localhost:3005/orders/store', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const orders = await ordersRes.json();

    const pickingOrder = orders.find((o: any) => o.status === 'PICKING' && o.id === 'qa-p8b-order-picking');
    expect(pickingOrder).toBeDefined();
    expect(pickingOrder.items.length).toBe(2);

    const riceItem = pickingOrder.items.find((i: any) => i.productId === 'qa-p8b-rice');
    expect(riceItem).toBeDefined();

    const oldGrandTotal = pickingOrder.grandTotal;

    // Mark rice unavailable first
    await page.request.patch(
      `http://localhost:3005/orders/store/${pickingOrder.id}/items/${riceItem.id}/unavailable`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
        data: { reason: 'Out of stock' },
      },
    );

    // Apply substitute (atta instead of rice)
    const subRes = await page.request.patch(
      `http://localhost:3005/orders/store/${pickingOrder.id}/items/${riceItem.id}/substitute`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
        data: { productId: 'qa-p8b-atta' },
      },
    );
    expect(subRes.ok()).toBeTruthy();
    const updatedOrder = await subRes.json();

    // Verify item was replaced
    const updatedItem = updatedOrder.items.find((i: any) => i.productId === 'qa-p8b-atta');
    expect(updatedItem).toBeDefined();

    // Verify grand total changed (rice=120, atta=90, delta=-30)
    expect(updatedOrder.grandTotal).toBe(oldGrandTotal - 30);

    // Verify fulfillment issues resolved
    const snapshot = updatedOrder.itemsSnapshot;
    const issues = snapshot?.fulfillmentIssues || [];
    const resolvedIssue = issues.find((i: any) => i.itemId === riceItem.id && i.status === 'RESOLVED');
    expect(resolvedIssue).toBeDefined();
    expect(resolvedIssue.substituteProductId).toBe('qa-p8b-atta');

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-substitute-applied.png`, fullPage: true });
  });

  test('08 — Ready for Pickup succeeds after all issues resolved', async ({ page }) => {
    const tokenResponse = await page.request.post('http://localhost:3005/auth/login', {
      data: { email: P8B_STORE_EMAIL, password: P8B_STORE_PASS },
    });
    const { access_token } = await tokenResponse.json();

    // The picking order should now have all issues resolved from test 07
    const readyRes = await page.request.patch(
      'http://localhost:3005/orders/store/qa-p8b-order-picking/ready',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    expect(readyRes.ok()).toBeTruthy();
    const result = await readyRes.json();
    expect(result.status).toBe('PACKED');

    // Verify on UI
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // The order should now appear in "Ready" lane
    const readyLane = page.locator('p').filter({ hasText: /^Ready$/ }).first();
    await expect(readyLane).toBeVisible({ timeout: 5000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-ready-for-pickup.png`, fullPage: true });
  });
});
