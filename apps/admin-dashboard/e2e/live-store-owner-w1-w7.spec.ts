import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.LIVE_BASE_URL || 'https://aagam.accesscam.org';
const EMAIL = process.env.LIVE_QA_STORE_EMAIL || '';
const PASSWORD = process.env.LIVE_QA_STORE_PASSWORD || '';
const STORE_A_ID = process.env.LIVE_QA_STORE_A_ID || '';
const STORE_B_ID = process.env.LIVE_QA_STORE_B_ID || '';
const STORE_A_NAME = process.env.LIVE_QA_STORE_A_NAME || 'AAGAM Live QA Store A';
const STORE_B_NAME = process.env.LIVE_QA_STORE_B_NAME || 'AAGAM Live QA Store B';
const MARKER_A = process.env.LIVE_QA_MARKER_A || '';
const MARKER_B = process.env.LIVE_QA_MARKER_B || '';
const PRODUCT = 'Manual Test Biscuits';
const EVIDENCE = path.resolve(__dirname, '../../../docs/qa/live-store-owner-w1-w7');
const SCREENSHOTS = path.join(EVIDENCE, 'screenshots');
fs.mkdirSync(SCREENSHOTS, { recursive: true });

type Result = { scenario: string; status: 'PASS' | 'FAIL'; details: string };
const results: Result[] = [];

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
}

async function login(page: Page) {
  if (!EMAIL || !PASSWORD) throw new Error('Live QA Store Owner credentials are missing.');
  await page.goto('/login');
  let emailInput = page.locator('input[type="email"]');
  if (!(await emailInput.count())) {
    const passwordMode = page.getByRole('button', { name: /password|email/i }).last();
    if (await passwordMode.count()) await passwordMode.click();
    emailInput = page.locator('input[type="email"]');
  }
  await expect(emailInput).toBeVisible();
  await emailInput.fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(() => !location.pathname.includes('/login'), null, { timeout: 30_000 });
  const cookie = (await page.context().cookies()).find((item) => item.name === 'access_token');
  expect(cookie?.httpOnly, 'Store Owner login must create an HttpOnly access_token').toBe(true);
}

async function selectStore(page: Page, storeId: string, storeName: string) {
  await page.goto('/store/inventory');
  await expect(page.getByRole('heading', { name: 'Products & inventory' })).toBeVisible();
  const selector = page.getByLabel('Select store');
  await expect(selector).toBeVisible();
  await selector.selectOption(storeId);
  await expect(page.getByText(/Managing /).first()).toContainText(storeName);
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
}

function productCard(page: Page) {
  return page.getByRole('article').filter({ hasText: PRODUCT }).first();
}

async function refreshStoreA(page: Page) {
  await selectStore(page, STORE_A_ID, STORE_A_NAME);
  return productCard(page);
}

async function saveCard(page: Page, card: ReturnType<typeof productCard>) {
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(`${PRODUCT} inventory updated.`, { exact: false })).toBeVisible();
}

async function availability(browser: Browser, suffix: string) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/shop');
  const data = await page.evaluate(async ({ product, storeId }) => {
    const params = new URLSearchParams({
      search: product,
      storeId,
      includeAvailability: 'true',
      page: '1',
      pageSize: '50',
    });
    const response = await fetch(`/api/products?${params.toString()}`, { credentials: 'include' });
    const body = await response.json();
    const items = Array.isArray(body) ? body : body.items || [];
    const item = items.find((row: any) => row.name === product);
    return {
      status: response.status,
      found: Boolean(item),
      isVisible: item?.availability?.isVisible ?? null,
      inStock: item?.availability?.inStock ?? null,
      availableQty: item?.availability?.availableQty ?? null,
    };
  }, { product: PRODUCT, storeId: STORE_A_ID });
  await shot(page, `w6-customer-${suffix}`);
  await context.close();
  expect(data.status).toBe(200);
  expect(data.found).toBe(true);
  return data;
}

async function runScenario(page: Page, name: string, fn: () => Promise<void>) {
  try {
    await test.step(name, fn);
    results.push({ scenario: name, status: 'PASS', details: 'Expected behaviour confirmed on production.' });
  } catch (error: any) {
    const details = error?.message || String(error);
    results.push({ scenario: name, status: 'FAIL', details });
    await shot(page, `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-failed`).catch(() => undefined);
  }
}

function writeReport() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  const rows = results.map((row) => `| ${row.scenario} | ${row.status} | ${row.details.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 500)} |`).join('\n');
  fs.writeFileSync(path.join(EVIDENCE, 'REPORT.md'), `# AAGAM Live Store Owner W1-W7\n\n| Scenario | Status | Details |\n|---|---|---|\n${rows}\n`);
}

test.afterAll(() => writeReport());

test('runs production Store Owner scenarios W1-W7 with dedicated QA data', async ({ page, browser, context }) => {
  test.setTimeout(12 * 60_000);
  await login(page);
  await selectStore(page, STORE_A_ID, STORE_A_NAME);

  await runScenario(page, 'W1', async () => {
    const requests: string[] = [];
    const listener = (request: any) => requests.push(request.url());
    page.on('request', listener);
    await selectStore(page, STORE_A_ID, STORE_A_NAME);
    const mineText = await page.getByTestId('my-products-grid').innerText();
    expect(mineText).not.toContain(PRODUCT);
    await page.getByTestId('add-products-tab').click();
    await page.getByLabel('Search Admin catalogue').fill(PRODUCT);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByTestId('catalogue-grid')).toContainText(PRODUCT);
    expect(await page.getByTestId('catalogue-grid').innerText()).not.toContain(MARKER_A);
    page.off('request', listener);
    expect(requests.some((url) => /\/api\/products\?.*pageSize=500/i.test(url))).toBe(false);
    const catalogRequests = requests.filter((url) => /\/stores\/[^/]+\/catalog/.test(url));
    expect(catalogRequests.length).toBeGreaterThan(0);
    for (const url of catalogRequests) {
      expect(Number(new URL(url).searchParams.get('pageSize') || 0)).toBeLessThanOrEqual(50);
    }
    await shot(page, 'w1-products-separated');
  });

  await runScenario(page, 'W2', async () => {
    await selectStore(page, STORE_A_ID, STORE_A_NAME);
    await page.getByTestId('add-products-tab').click();
    await page.getByLabel('Search Admin catalogue').fill(PRODUCT);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const card = productCard(page);
    await expect(card).toBeVisible();
    await shot(page, 'w2-before-add');
    await card.getByRole('spinbutton', { name: `${PRODUCT} opening stock`, exact: true }).fill('25');
    await card.getByRole('spinbutton', { name: `${PRODUCT} new store price`, exact: true }).fill('85');
    const responsePromise = page.waitForResponse((response) => /\/api\/stores\/[^/]+\/assortment/.test(response.url()) && response.request().method() === 'POST');
    await card.getByRole('button', { name: 'Add to store', exact: true }).click();
    expect((await responsePromise).ok()).toBe(true);
    await expect(page.getByText(`${PRODUCT} added to this store with 25 opening units.`, { exact: false })).toBeVisible();
    await shot(page, 'w2-add-success');
    let mine = productCard(page);
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('25');
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('85');
    mine = await refreshStoreA(page);
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('25');
    await expect(mine.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('85');
    await expect(page.getByRole('article').filter({ hasText: PRODUCT })).toHaveCount(1);
  });

  await runScenario(page, 'W3', async () => {
    let card = await refreshStoreA(page);
    const update = async (value: string) => {
      await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill(value);
      await saveCard(page, card);
      card = await refreshStoreA(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue(value);
    };
    await update('20');
    await card.getByRole('button', { name: `Increase ${PRODUCT} stock`, exact: true }).click();
    await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('21');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    await card.getByRole('button', { name: `Decrease ${PRODUCT} stock`, exact: true }).click();
    await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('20');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    await update('0');
    await expect(page.getByRole('article').filter({ hasText: PRODUCT })).toHaveCount(1);
    await shot(page, 'w3-stock-updates');
  });

  await runScenario(page, 'W4', async () => {
    let card = await refreshStoreA(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('20');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    for (const value of ['', '-1', '1.5', 'abc', '1000001']) {
      const input = card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true });
      await input.fill('');
      if (value) await input.pressSequentially(value).catch(() => undefined);
      let patchSent = false;
      const listener = (request: any) => {
        if (request.method() === 'PATCH' && /\/stores\/[^/]+\/inventory/.test(request.url())) patchSent = true;
      };
      page.on('request', listener);
      await card.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Stock must be a whole number between 0 and 1,000,000.', { exact: false })).toBeVisible();
      page.off('request', listener);
      expect(patchSent, `Invalid stock ${value || 'blank'} sent a PATCH`).toBe(false);
      card = await refreshStoreA(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true })).toHaveValue('20');
    }
    await shot(page, 'w4-invalid-stock-protected');
  });

  await runScenario(page, 'W5', async () => {
    let card = await refreshStoreA(page);
    for (const accepted of ['90', '100']) {
      await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill(accepted);
      await saveCard(page, card);
      card = await refreshStoreA(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue(accepted);
    }
    for (const rejected of ['100.01', '120']) {
      await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill(rejected);
      await card.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText(/cannot exceed Admin MRP/i)).toBeVisible();
      card = await refreshStoreA(page);
      await expect(card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('100');
    }
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('-1');
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/valid non-negative amount/i)).toBeVisible();
    card = await refreshStoreA(page);
    const price = card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true });
    await price.fill('');
    await price.pressSequentially('abc').catch(() => undefined);
    let patchSent = false;
    const listener = (request: any) => {
      if (request.method() === 'PATCH' && /\/stores\/[^/]+\/inventory/.test(request.url())) patchSent = true;
    };
    page.on('request', listener);
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(800);
    page.off('request', listener);
    expect(patchSent, 'Invalid text was silently treated as empty/default pricing').toBe(false);
    card = await refreshStoreA(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    await expect(card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true })).toHaveValue('');
    await shot(page, 'w5-price-validation');
  });

  await runScenario(page, 'W6', async () => {
    let card = await refreshStoreA(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('10');
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('85');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    if (await card.getByRole('button', { name: 'Hidden', exact: true }).count()) {
      await card.getByRole('button', { name: 'Hidden', exact: true }).click();
      card = await refreshStoreA(page);
    }
    if (await card.getByRole('button', { name: 'Auto-hide: Off', exact: true }).count()) {
      await card.getByRole('button', { name: 'Auto-hide: Off', exact: true }).click();
      card = await refreshStoreA(page);
    }
    expect(await availability(browser, 'listed-in-stock')).toMatchObject({ isVisible: true, inStock: true, availableQty: 10 });

    await card.getByRole('button', { name: 'Listed', exact: true }).click();
    card = await refreshStoreA(page);
    expect((await availability(browser, 'hidden')).isVisible).toBe(false);

    await card.getByRole('button', { name: 'Hidden', exact: true }).click();
    card = await refreshStoreA(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('0');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    expect((await availability(browser, 'zero-autohide-on')).isVisible).toBe(false);
    await expect(card).toBeVisible();

    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('5');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    expect(await availability(browser, 'restocked')).toMatchObject({ isVisible: true, inStock: true, availableQty: 5 });

    await card.getByRole('button', { name: 'Auto-hide: On', exact: true }).click();
    card = await refreshStoreA(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('0');
    await saveCard(page, card);
    card = await refreshStoreA(page);
    expect(await availability(browser, 'zero-autohide-off')).toMatchObject({ isVisible: true, inStock: false, availableQty: 0 });
    await expect(card).toBeVisible();

    await card.getByRole('button', { name: 'Auto-hide: Off', exact: true }).click();
    card = await refreshStoreA(page);
    await card.getByRole('spinbutton', { name: `${PRODUCT} stock`, exact: true }).fill('20');
    await card.getByRole('spinbutton', { name: `${PRODUCT} store price`, exact: true }).fill('85');
    await saveCard(page, card);
    await shot(page, 'w6-restored');
  });

  await runScenario(page, 'W7', async () => {
    await selectStore(page, STORE_A_ID, STORE_A_NAME);
    const selector = page.getByLabel('Select store');
    const options = await selector.locator('option').evaluateAll((items) => items.map((item) => ({ value: item.value, text: item.textContent?.trim() || '' })));
    expect(options.some((item) => item.value === STORE_A_ID)).toBe(true);
    expect(options.some((item) => item.value === STORE_B_ID)).toBe(true);
    await expect(page.getByTestId('my-products-grid')).toContainText(MARKER_A);
    await expect(page.getByTestId('my-products-grid')).not.toContainText(MARKER_B);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: 50 * 1024,
      uploadThroughput: 20 * 1024,
      connectionType: 'cellular3g',
    });
    await selector.selectOption(STORE_A_ID);
    await page.waitForTimeout(80);
    await selector.selectOption(STORE_B_ID);
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Managing /).first()).toContainText(STORE_B_NAME);
    await expect(selector).toHaveValue(STORE_B_ID);
    await expect(page.getByTestId('my-products-grid')).toContainText(MARKER_B);
    await expect(page.getByTestId('my-products-grid')).not.toContainText(MARKER_A);
    await shot(page, 'w7-store-b-after-slow-3g-switch');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'none',
    });
  });

  writeReport();
  const failures = results.filter((row) => row.status === 'FAIL');
  expect(failures, failures.map((row) => `${row.scenario}: ${row.details}`).join('\n')).toHaveLength(0);
});
