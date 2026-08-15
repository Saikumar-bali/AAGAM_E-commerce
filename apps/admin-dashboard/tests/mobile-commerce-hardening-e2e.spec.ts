import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Browser, BrowserContext, Page, expect, test } from '@playwright/test';

const WEB_BASE = 'http://localhost:3001';
const PROOF_DIR = path.resolve(__dirname, '../../../docs/qa/phase-4');
const CART = [
  { id: 'qa-prod-rice', name: 'QA Rice (1kg)', price: 120, quantity: 2 },
  { id: 'qa-p8b-atta', name: 'P8B Whole Wheat Atta (1kg)', price: 90, quantity: 1 },
];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for strict E2E acceptance`);
  return value;
}

async function login(
  browser: Browser,
  role: 'admin' | 'customer',
): Promise<{ context: BrowserContext; page: Page }> {
  const upper = role.toUpperCase();
  const context = await browser.newContext({ baseURL: WEB_BASE });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Phone number or email').fill(requiredEnv(`${upper}_EMAIL`));
  await page.getByLabel('Password').fill(requiredEnv(`${upper}_PASSWORD`));
  await Promise.all([
    page.waitForURL(role === 'admin' ? '**/admin**' : '**/shop**'),
    page.locator('button[type="submit"]').click(),
  ]);
  const cookie = (await context.cookies()).find((item) => item.name === 'access_token');
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
  return { context, page };
}

async function storeCart(page: Page) {
  await page.evaluate((items) => {
    localStorage.setItem('aagam_cart', JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('aagam:cart-changed', { detail: items }));
  }, CART);
}

const subtotalRow = (page: Page) =>
  page.getByText('Subtotal', { exact: true }).locator('..');

const customerNavigation = (page: Page) =>
  page.getByRole('navigation', { name: 'Customer navigation' });

test.describe.serial('Mobile commerce hardening E2E acceptance', () => {
  test.beforeAll(() => mkdirSync(PROOF_DIR, { recursive: true }));

  test('HttpOnly cookie navigation does not flash the secure-session screen', async ({ page, context }) => {
    await page.addInitScript(() => {
      const state = window as typeof window & {
        __loaderVisible?: boolean;
        __loaderTransitions?: number;
      };
      state.__loaderVisible = false;
      state.__loaderTransitions = 0;
      const inspect = () => {
        const visible = Boolean(document.body?.innerText.includes('Opening your workspace'));
        if (visible && !state.__loaderVisible) {
          state.__loaderTransitions = (state.__loaderTransitions || 0) + 1;
        }
        state.__loaderVisible = visible;
      };
      new MutationObserver(inspect).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      window.addEventListener('DOMContentLoaded', inspect);
    });

    await page.goto('/shop');
    await expect(customerNavigation(page)).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name === 'access_token');
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
    const transitions = () => page.evaluate(() =>
      ((window as typeof window & { __loaderTransitions?: number }).__loaderTransitions || 0));
    const baseline = await transitions();

    await customerNavigation(page).getByRole('link', { name: 'My Orders' }).click();
    await page.waitForURL('**/shop/orders');
    await expect(customerNavigation(page)).toBeVisible();
    await expect(page.getByText('Opening your workspace')).toBeHidden();
    await customerNavigation(page).getByRole('link', { name: 'Deals' }).click();
    await page.waitForURL('**/shop/deals');
    await expect(customerNavigation(page)).toBeVisible();
    await expect(page.getByText('Opening your workspace')).toBeHidden();
    expect(await transitions()).toBe(baseline);
    await page.screenshot({ path: path.join(PROOF_DIR, 'mobile-hardening-01-cookie-navigation-stable.png'), fullPage: true });
  });

  test('persisted cart has a non-zero checkout subtotal and a movable live-location pin', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'], { origin: WEB_BASE });
    await context.setGeolocation({ latitude: 23.0225, longitude: 72.5714 });
    let reverseCalls = 0;
    await page.route('**/geo/reverse**', async (route) => {
      reverseCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, address: {
          line1: 'QA Entrance', landmark: 'QA Landmark', city: 'Ahmedabad',
          state: 'Gujarat', pincode: '380015', country: 'IN',
        } }),
      });
    });
    await page.addInitScript((items) => localStorage.setItem('aagam_cart', JSON.stringify(items)), CART);
    await page.goto('/shop/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await expect(page.getByText('Bill Details')).toBeVisible();
    await expect(page.getByText('QA Rice (1kg)')).toBeVisible();
    await expect(page.getByText('P8B Whole Wheat Atta (1kg)')).toBeVisible();
    await expect(subtotalRow(page)).toContainText(/₹\s*330/);
    await expect(page.getByText('Grand Total', { exact: true }).locator('..')).not.toContainText(/₹\s*0\b/);
    await expect(page.locator('body')).not.toContainText('Automatic offers are evaluated by the server. Code offers are checked against cart, account, store, schedule, and usage limits.');

    await page.getByRole('button', { name: 'Add address' }).click();
    await page.getByRole('button', { name: 'Use live location' }).click();
    const map = page.locator('.leaflet-container');
    await expect(map).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/23\.02250,\s*72\.57140/)).toBeVisible();
    const box = await map.boundingBox();
    if (!box) throw new Error('Live-location map did not expose a clickable box');
    await map.click({ position: { x: box.width * 0.72, y: box.height * 0.32 } });
    await expect.poll(async () => reverseCalls).toBeGreaterThan(1);
    await expect(page.getByText(/23\.02250,\s*72\.57140/)).toBeHidden();
    await expect(page.getByText('Drag the pin or tap the map to set the entrance.')).toBeVisible();
    await page.screenshot({ path: path.join(PROOF_DIR, 'mobile-hardening-02-checkout-subtotal-live-map.png'), fullPage: true });
  });

  test('admin draft coupon becomes active, appears to customer, and applies at checkout', async ({ browser }) => {
    const code = `E2E${Date.now().toString(36).toUpperCase()}`;
    const name = `Strict E2E offer ${code}`;
    const admin = await login(browser, 'admin');
    try {
      await admin.page.goto('/admin/promotions');
      await expect(admin.page.getByRole('heading', { name: 'Promotions & Coupons' })).toBeVisible();
      await admin.page.getByRole('button', { name: 'Pricing coupons' }).click();
      await admin.page.getByRole('button', { name: 'New coupon' }).click();
      await admin.page.getByLabel('Code / internal key').fill(code);
      await admin.page.getByLabel('Customer name').fill(name);
      await admin.page.getByLabel('Description').fill('Strict Playwright acceptance coupon.');
      await admin.page.getByLabel('Percentage', { exact: true }).fill('10');
      await admin.page.getByLabel('Minimum cart ₹').fill('0');
      const created = admin.page.waitForResponse((response) =>
        response.url().includes('/admin/promotions/coupons') && response.request().method() === 'POST');
      await admin.page.getByRole('button', { name: 'Create coupon', exact: true }).click();
      expect((await created).ok()).toBe(true);
      await expect(admin.page.getByText('Coupon created.')).toBeVisible();
      const row = admin.page.locator('tr').filter({ hasText: code });
      await expect(row).toBeVisible();
      await expect(row).toContainText('ACTIVE');
      await admin.page.screenshot({ path: path.join(PROOF_DIR, 'mobile-hardening-03-admin-coupon-active.png'), fullPage: true });
    } finally {
      await admin.context.close();
    }

    const customer = await login(browser, 'customer');
    try {
      await storeCart(customer.page);
      const dealsRequest = customer.page.waitForResponse((response) =>
        response.url().includes('/promotions/deals') && response.request().method() === 'GET');
      await customer.page.goto('/shop/deals');
      const deals = await (await dealsRequest).json();
      expect(Array.isArray(deals?.coupons) && deals.coupons.some((item: { code?: string }) => item.code === code)).toBe(true);
      const offer = customer.page.locator('article').filter({ hasText: code });
      await expect(offer).toBeVisible();
      await expect(offer).toContainText(name);
      await offer.getByRole('button', { name: 'Use offer' }).click();
      await customer.page.waitForURL(`**/shop/checkout?coupon=${code}`);
      await expect(customer.page.getByText(`${code} applied`)).toBeVisible({ timeout: 15_000 });
      await expect(subtotalRow(customer.page)).toContainText(/₹\s*330/);
      await expect(customer.page.getByText('Discount', { exact: true }).locator('..')).toContainText(/-₹\s*33/);
      await customer.page.screenshot({ path: path.join(PROOF_DIR, 'mobile-hardening-04-customer-coupon-applied.png'), fullPage: true });
    } finally {
      await customer.context.close();
    }
  });
});
