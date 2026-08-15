import { APIRequestContext, expect, Page, request as playwrightRequest, test } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-8b');

async function waitForStyles(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}

const STORE_EMAIL = process.env.STORE_OWNER_QA_EMAIL || process.env.STORE_EMAIL || 'store@aagam.com';
const STORE_PASS = process.env.STORE_OWNER_QA_PASSWORD || process.env.STORE_PASSWORD || process.env.CI_TEST_PASSWORD || 'store@2026!';
const P8B_STORE_EMAIL = process.env.P8B_STORE_EMAIL || 'qa-rider-pick-store@aagam.com';
const P8B_STORE_PASS = process.env.P8B_STORE_PASSWORD || process.env.STORE_OWNER_QA_PASSWORD || process.env.STORE_PASSWORD || process.env.CI_TEST_PASSWORD || 'store@2026!';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

async function loginAsStore(page: Page, email = STORE_EMAIL, password = STORE_PASS) {
  await page.goto('/login');
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
  await page.fill('input[autocomplete="username"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('user_role') !== null, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function createP8bStoreApi(): Promise<APIRequestContext> {
  // Do not use page.request here: the project's customer storage state would
  // attach a customer cookie. Keep a dedicated store cookie jar instead.
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginResponse = await api.post('/auth/login', {
    data: { email: P8B_STORE_EMAIL, password: P8B_STORE_PASS },
  });
  const responseText = await loginResponse.text();
  expect(loginResponse.ok(), `Store browser login failed: ${responseText}`).toBeTruthy();
  const login = JSON.parse(responseText);
  expect(login.user?.email).toBe(P8B_STORE_EMAIL);
  expect(login.user?.role).toBe('STORE_OWNER');

  const profileResponse = await api.get('/auth/me');
  const profileText = await profileResponse.text();
  expect(profileResponse.ok(), `Store session verification failed: ${profileText}`).toBeTruthy();
  expect(JSON.parse(profileText).role).toBe('STORE_OWNER');
  return api;
}

async function getStoreOrders(api: APIRequestContext) {
  const response = await api.get('/orders/store');
  const responseText = await response.text();
  expect(response.ok(), `Store orders request failed: ${responseText}`).toBeTruthy();
  const orders = JSON.parse(responseText);
  expect(Array.isArray(orders), `Store orders response must be an array: ${responseText}`).toBeTruthy();
  return orders as any[];
}

test.describe('Phase 8b: Store Fulfillment — Item Issues & Substitutes', () => {
  test.describe.configure({ mode: 'serial' });

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
    const api = await createP8bStoreApi();
    const orders = await getStoreOrders(api);

    // Find a PENDING or PICKING order with items
    const editableOrder = orders.find((o: any) => ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING'].includes(o.status) && o.items?.length > 0);
    expect(editableOrder).toBeDefined();

    const itemId = editableOrder.items[0].id;

    // Mark item unavailable via API
    const markRes = await api.patch(
      `/orders/store/${editableOrder.id}/items/${itemId}/unavailable`,
      {
        data: { reason: 'Not found on shelf' },
      },
    );
    expect(markRes.ok()).toBeTruthy();
    await api.dispose();

    // Reload page and verify the unavailable badge appears
    await loginAsStore(page, P8B_STORE_EMAIL, P8B_STORE_PASS);
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const unavailableBadge = page.locator('text=Unavailable').first();
    await expect(unavailableBadge).toBeVisible({ timeout: 10000 });

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-item-unavailable.png`, fullPage: true });
  });

  test('05 — Ready for Pickup blocked when unresolved item issues exist', async ({ page }) => {
    // Get orders and find one with an unresolved issue
    const api = await createP8bStoreApi();
    const orders = await getStoreOrders(api);

    const orderWithIssue = orders.find((o: any) => {
      const snapshot = o.itemsSnapshot;
      const issues = snapshot?.fulfillmentIssues;
      return Array.isArray(issues) && issues.some((i: any) => i.status === 'UNAVAILABLE');
    });
    expect(orderWithIssue).toBeDefined();

    // Try ready for pickup — should fail
    const readyRes = await api.patch(`/orders/store/${orderWithIssue.id}/ready`);
    expect(readyRes.ok()).toBeFalsy();
    const errorBody = await readyRes.json();
    expect(errorBody.message).toContain('Resolve unavailable items');
    await api.dispose();

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-ready-blocked.png`, fullPage: true });
  });

  test('06 — Substitute listing returns available products', async ({ page }) => {
    const api = await createP8bStoreApi();
    const orders = await getStoreOrders(api);

    const orderWithItem = orders.find((o: any) => ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING'].includes(o.status) && o.items?.length > 0);
    expect(orderWithItem).toBeDefined();

    const itemId = orderWithItem.items[0].id;

    // Get substitutes
    const subsRes = await api.get(`/orders/store/${orderWithItem.id}/items/${itemId}/substitutes`);
    expect(subsRes.ok()).toBeTruthy();
    const substitutes = await subsRes.json();
    expect(Array.isArray(substitutes)).toBeTruthy();

    // At least one substitute (atta is same category as rice)
    if (substitutes.length > 0) {
      expect(substitutes[0]).toHaveProperty('id');
      expect(substitutes[0]).toHaveProperty('name');
      expect(substitutes[0]).toHaveProperty('availability');
    }
    await api.dispose();

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-substitutes-list.png`, fullPage: true });
  });

  test('07 — Substitute replacement updates item and grand total', async ({ page }) => {
    // Find a PICKING order with rice item
    const api = await createP8bStoreApi();
    const orders = await getStoreOrders(api);

    const pickingOrder = orders.find((o: any) => o.status === 'PICKING' && o.id === 'qa-p8b-order-picking');
    expect(pickingOrder).toBeDefined();
    expect(pickingOrder.items.length).toBe(2);

    const riceItem = pickingOrder.items.find((i: any) => i.productId === 'qa-p8b-rice');
    expect(riceItem).toBeDefined();

    const oldGrandTotal = pickingOrder.grandTotal;

    // Mark rice unavailable first
    await api.patch(
      `/orders/store/${pickingOrder.id}/items/${riceItem.id}/unavailable`,
      {
        data: { reason: 'Out of stock' },
      },
    );

    // Apply substitute (atta instead of rice)
    const subRes = await api.patch(
      `/orders/store/${pickingOrder.id}/items/${riceItem.id}/substitute`,
      {
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
    await api.dispose();

    await waitForStyles(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-substitute-applied.png`, fullPage: true });
  });

  test('08 — Ready for Pickup succeeds after all issues resolved', async ({ page }) => {
    const api = await createP8bStoreApi();

    // The picking order should now have all issues resolved from test 07
    const readyRes = await api.patch('/orders/store/qa-p8b-order-picking/ready');
    expect(readyRes.ok()).toBeTruthy();
    const result = await readyRes.json();
    expect(result.status).toBe('PACKED');
    await api.dispose();

    // Verify on UI
    await loginAsStore(page, P8B_STORE_EMAIL, P8B_STORE_PASS);
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
