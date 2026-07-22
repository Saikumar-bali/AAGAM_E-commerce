import { test, expect, type Page, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCT = 'Manual Test Biscuits';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@aagam.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@2026!';
const STORE_EMAIL = process.env.STORE_EMAIL || 'store@aagam.com';
const STORE_PASSWORD = process.env.STORE_PASSWORD || 'store@2026!';
const PROOF = path.resolve(__dirname, '../../../docs/qa/live-inventory-ui/screenshots');
fs.mkdirSync(PROOF, { recursive: true });

let createdNow = false;
let selectedStoreName = '';

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(PROOF, `${name}.png`), fullPage: true });
}

async function login(page: Page, email: string, password: string, role: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30_000 });
  const cookie = (await page.context().cookies()).find((item) => item.name === 'access_token');
  expect(cookie, `${role} access_token cookie`).toBeTruthy();
  expect(cookie?.httpOnly, `${role} access_token must be HttpOnly`).toBe(true);
}

async function fillAnyLabel(page: Page, names: string[], value: string) {
  for (const name of names) {
    const field = page.getByLabel(name, { exact: false });
    if (await field.count()) {
      await field.first().fill(value);
      return;
    }
  }
  throw new Error(`Missing labelled field: ${names.join(' / ')}`);
}

async function adminRow(page: Page) {
  await page.getByPlaceholder('Search products or categories').fill(PRODUCT);
  await page.waitForTimeout(500);
  return page.locator('tbody tr').filter({ hasText: PRODUCT }).first();
}

async function productCard(page: Page) {
  return page.getByRole('article').filter({ hasText: PRODUCT }).first();
}

async function refreshStore(page: Page) {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Products & inventory' })).toBeVisible();
  return productCard(page);
}

async function saveCard(page: Page, card: any) {
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(`${PRODUCT} inventory updated.`, { exact: false })).toBeVisible();
}

async function publicProbe(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/shop');
  const search = page.locator('input[placeholder*="Search" i], input[aria-label*="Search" i]').first();
  if (await search.count()) {
    await search.fill(PRODUCT);
    await search.press('Enter').catch(() => undefined);
    await page.waitForTimeout(1200);
  }
  const found = (await page.locator('body').innerText()).toLowerCase().includes(PRODUCT.toLowerCase());
  await screenshot(page, `customer-${Date.now()}-${found ? 'visible' : 'absent'}`);
  await context.close();
  return found;
}

test.describe.serial('AAGAM live Admin and Store inventory UI', () => {
  test('A1 Admin creates a catalogue product', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin');
    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible();

    let row = await adminRow(page);
    if (!(await row.count())) {
      await page.getByRole('button', { name: 'Add Product', exact: true }).click();
      await fillAnyLabel(page, ['Product name'], PRODUCT);
      await fillAnyLabel(page, ['Default selling price', 'Selling price', 'Price'], '90');
      await fillAnyLabel(page, ['MRP', 'Maximum retail price'], '100');
      const category = page.getByLabel(/Category/i).first();
      const options = await category.locator('option').evaluateAll((els) => els.map((el) => ({ value: el.value, text: el.textContent || '' })));
      const active = options.find((item) => item.value && !/select|all/i.test(item.text));
      expect(active, 'active category option').toBeTruthy();
      await category.selectOption(active!.value);
      expect(await page.getByText(/image/i).count(), 'image control/label present').toBeGreaterThan(0);
      await screenshot(page, 'a1-product-creation-form');
      const form = page.locator('form').filter({ has: page.getByLabel('Product name', { exact: false }) }).first();
      const responsePromise = page.waitForResponse((r) => /\/api\/products(?:\?|$)/.test(r.url()) && r.request().method() === 'POST');
      await form.locator('button[type="submit"]').last().click();
      expect((await responsePromise).ok()).toBe(true);
      createdNow = true;
      row = await adminRow(page);
    }

    await expect(row).toContainText(PRODUCT);
    await expect(row).toContainText(/₹90(?:\.00)?/);
    await expect(row.locator('button[title="Edit catalogue product"]')).toHaveCount(1);
    await screenshot(page, 'a1-product-visible-admin-catalogue');
  });

  test('A2 Admin inventory is read-only', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin');
    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible();
    const storeSelect = page.locator('select').last();
    const options = await storeSelect.locator('option').evaluateAll((els) => els.map((el) => ({ value: el.value, text: el.textContent?.trim() || '' })));
    const store = options.find((item) => item.value && !/no stores|select/i.test(item.text));
    expect(store, 'store selector option').toBeTruthy();
    selectedStoreName = store!.text.replace(/\s+\(Inactive\)$/i, '');
    await storeSelect.selectOption(store!.value);
    const overview = page.locator('[data-testid^="admin-stock-overview-"]').first();
    await expect(overview).toContainText(/\d+ units/);
    await expect(overview).toContainText('Managed by the Store Owner');
    await expect(overview.getByRole('spinbutton')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(overview.locator('xpath=ancestor::tr').locator('button[title="Edit catalogue product"]')).toHaveCount(1);
    await screenshot(page, 'a2-admin-inventory-read-only');
  });

  test('W1 My Products and Add Products are separated and requests are capped', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    await page.goto('/store/inventory');
    await expect(page.getByRole('heading', { name: 'Products & inventory' })).toBeVisible();
    const mineHas = (await page.getByTestId('my-products-grid').count()) > 0 && (await page.getByTestId('my-products-grid').innerText()).includes(PRODUCT);
    await page.getByTestId('add-products-tab').click();
    await page.getByLabel('Search Admin catalogue').fill(PRODUCT);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const addHas = (await page.getByTestId('catalogue-grid').count()) > 0 && (await page.getByTestId('catalogue-grid').innerText()).includes(PRODUCT);
    expect(mineHas && addHas, 'same product in both tabs').toBe(false);
    if (createdNow) expect({ mineHas, addHas }).toEqual({ mineHas: false, addHas: true });
    expect(requests.some((url) => /\/api\/products\?.*pageSize=500/i.test(url))).toBe(false);
    const catalogUrls = requests.filter((url) => /\/stores\/[^/]+\/catalog/.test(url));
    expect(catalogUrls.length).toBeGreaterThan(0);
    for (const url of catalogUrls) expect(Number(new URL(url).searchParams.get('pageSize') || 0)).toBeLessThanOrEqual(50);
    await screenshot(page, 'w1-products-separation');
  });

  test('W2 Add product with opening stock 25 and store price 85', async ({ page }) => {
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    await page.goto('/store/inventory');
    await page.getByTestId('add-products-tab').click();
    await page.getByLabel('Search Admin catalogue').fill(PRODUCT);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const card = await productCard(page);
    if (!(await card.count())) test.skip(true, 'Product is already carried by the store; opening-stock addition is not repeatable.');
    await screenshot(page, 'w2-product-before-adding');
    await card.getByRole('spinbutton', { name: `${PRODUCT} opening stock`, exact: true }).fill('25');
    await card.getByRole('spinbutton', { name: `${PRODUCT} new store price`, exact: true }).fill('85');
    const responsePromise = page.waitForResponse((r) => /\/api\/stores\/[^/]+\/assortment(?:\?|$)/.test(r.url()) && r.request().method() === 'POST');
    await card.getByRole('button', { name: 'Add to store', exact: true }).click();
    expect((await responsePromise).ok()).toBe(true);
    await expect(page.getByText(`${PRODUCT} added to this store with 25 opening units.`, { exact: false })).toBeVisible();
    await screenshot(page, 'w2-add-success-message');
    let mine = await productCard(page);
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('25');
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('85');
    await screenshot(page, 'w2-my-products-quantity-25');
    mine = await refreshStore(page);
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('25');
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('85');
    test.info().annotations.push({ type: 'backend', description: 'Opening-stock POST succeeded. The service implementation writes OPENING_STOCK atomically, but no ledger-history UI/API is exposed for independent live readback.' });
  });

  test('W3 Update daily stock and preserve a single record', async ({ page }) => {
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    await page.goto('/store/inventory');
    let card = await productCard(page);
    if (!(await card.count())) test.skip(true, 'Test product is not in My Products.');
    const update = async (value: string) => {
      await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill(value);
      await saveCard(page, card);
      card = await refreshStore(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue(value);
    };
    await update('20');
    await card.getByRole('button', { name: `Increase ${PRODUCT} stock`, exact: true }).click();
    await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('21');
    await saveCard(page, card); card = await refreshStore(page);
    await card.getByRole('button', { name: `Decrease ${PRODUCT} stock`, exact: true }).click();
    await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('20');
    await saveCard(page, card); card = await refreshStore(page);
    await update('0');
    await expect(page.getByRole('article').filter({ hasText: PRODUCT })).toHaveCount(1);
    await screenshot(page, 'w3-stock-zero-persisted');
  });

  test('W4 Reject invalid quantities without changing stock', async ({ page }) => {
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    await page.goto('/store/inventory');
    let card = await productCard(page);
    if (!(await card.count())) test.skip(true, 'Test product is not in My Products.');
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('20');
    await saveCard(page, card); card = await refreshStore(page);
    const cases = ['', '-1', '1.5', 'abc', '1000001'];
    for (const value of cases) {
      const input = card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true });
      await input.fill('');
      if (value) await input.pressSequentially(value).catch(() => undefined);
      let patchSent = false;
      const listener = (r: any) => { if (r.method() === 'PATCH' && /\/stores\/[^/]+\/inventory/.test(r.url())) patchSent = true; };
      page.on('request', listener);
      await card.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Stock must be a whole number between 0 and 1,000,000.', { exact: false })).toBeVisible();
      page.off('request', listener);
      expect(patchSent, `invalid quantity ${value || 'blank'} must not send PATCH`).toBe(false);
      card = await refreshStore(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('20');
    }
    await screenshot(page, 'w4-invalid-quantities-finished');
  });

  test('W5 Validate store selling price against MRP 100', async ({ page }) => {
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    await page.goto('/store/inventory');
    let card = await productCard(page);
    if (!(await card.count())) test.skip(true, 'Test product is not in My Products.');
    for (const accepted of ['90', '100']) {
      await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill(accepted);
      await saveCard(page, card); card = await refreshStore(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue(accepted);
    }
    for (const rejected of ['100.01', '120']) {
      await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill(rejected);
      await card.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText(/cannot exceed Admin MRP/i)).toBeVisible();
      card = await refreshStore(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('100');
    }
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('-1');
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/valid non-negative amount/i)).toBeVisible();
    card = await refreshStore(page);

    const price = card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true });
    await price.fill('');
    await price.pressSequentially('abc').catch(() => undefined);
    const browserValue = await price.inputValue();
    let patchSent = false;
    const listener = (r: any) => { if (r.method() === 'PATCH' && /\/stores\/[^/]+\/inventory/.test(r.url())) patchSent = true; };
    page.on('request', listener);
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1000);
    page.off('request', listener);
    expect({ browserValue, patchSent }, 'invalid text must be rejected, not treated as empty/default').toEqual({ browserValue: '', patchSent: false });

    card = await refreshStore(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('');
    await saveCard(page, card); card = await refreshStore(page);
    await expect(card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('');
    await screenshot(page, 'w5-price-validation');
  });

  test('W6 Listing and auto-hide controls', async ({ page, browser }) => {
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    await page.goto('/store/inventory');
    let card = await productCard(page);
    if (!(await card.count())) test.skip(true, 'Test product is not in My Products.');
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('10');
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('85');
    await saveCard(page, card); card = await refreshStore(page);
    if (await card.getByRole('button', { name: 'Hidden', exact: true }).count()) { await card.getByRole('button', { name: 'Hidden', exact: true }).click(); card = await refreshStore(page); }
    if (await card.getByRole('button', { name: 'Auto-hide: Off', exact: true }).count()) { await card.getByRole('button', { name: 'Auto-hide: Off', exact: true }).click(); card = await refreshStore(page); }
    const baseline = await publicProbe(browser);

    await card.getByRole('button', { name: 'Listed', exact: true }).click(); card = await refreshStore(page);
    await expect(card.getByRole('button', { name: 'Hidden', exact: true })).toBeVisible();
    if (baseline) expect(await publicProbe(browser), 'hidden product on public shop').toBe(false);

    await card.getByRole('button', { name: 'Hidden', exact: true }).click(); card = await refreshStore(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('0'); await saveCard(page, card); card = await refreshStore(page);
    if (baseline) expect(await publicProbe(browser), 'auto-hide on + zero stock').toBe(false);
    await expect(card).toBeVisible();

    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('5'); await saveCard(page, card); card = await refreshStore(page);
    if (baseline) expect(await publicProbe(browser), 'restocked product should return').toBe(true);

    await card.getByRole('button', { name: 'Auto-hide: On', exact: true }).click(); card = await refreshStore(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('0'); await saveCard(page, card); card = await refreshStore(page);
    await expect(card).toBeVisible();
    test.info().annotations.push({ type: 'customer-baseline', description: baseline ? 'Public storefront baseline resolved.' : 'Public storefront did not show the valid in-stock/listed baseline; customer visibility checks were not conclusive.' });

    if (await card.getByRole('button', { name: 'Auto-hide: Off', exact: true }).count()) { await card.getByRole('button', { name: 'Auto-hide: Off', exact: true }).click(); card = await refreshStore(page); }
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('20');
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('85');
    await saveCard(page, card);
    await screenshot(page, 'w6-restored-final-state');
  });

  test('W7 Multi-store slow-3G switching race', async ({ page, context }) => {
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    await page.goto('/store/inventory');
    const selector = page.getByLabel('Select store');
    if (!(await selector.count())) test.skip(true, 'Store Owner account has only one store.');
    const options = await selector.locator('option').evaluateAll((els) => els.map((el) => ({ value: el.value, text: el.textContent?.trim() || '' })));
    if (options.length < 2) test.skip(true, 'Store Owner account has fewer than two stores.');
    const [a, b] = options;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 20 * 1024, connectionType: 'cellular3g' });
    await selector.selectOption(a.value); await page.waitForTimeout(80); await selector.selectOption(b.value);
    await page.waitForTimeout(2500);
    await expect(page.getByText(/Managing /).first()).toContainText(b.text);
    await expect(selector).toHaveValue(b.value);
    await screenshot(page, 'w7-multistore-slow3g');
  });

  test('W8 Responsive inventory at four viewports', async ({ page }) => {
    await login(page, STORE_EMAIL, STORE_PASSWORD, 'Store Owner');
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/store/inventory');
      await expect(page.getByRole('heading', { name: 'Products & inventory' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${viewport.width}×${viewport.height} horizontal overflow`).toBe(true);
      await expect(page.getByTestId('my-products-tab')).toBeVisible();
      await expect(page.getByTestId('add-products-tab')).toBeVisible();
      const card = await productCard(page);
      if (await card.count()) {
        await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toBeVisible();
        await expect(card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toBeVisible();
        await expect(card.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
        await expect(card.getByRole('button', { name: /^(Listed|Hidden)$/ })).toBeVisible();
        await expect(card.getByRole('button', { name: /Auto-hide:/ })).toBeVisible();
      }
      await screenshot(page, `w8-${viewport.width}x${viewport.height}`);
    }
    test.info().annotations.push({ type: 'store', description: selectedStoreName || 'Store selector resolved during A2.' });
  });
});
