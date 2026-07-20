import { APIRequestContext, expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const WEB_BASE = 'http://localhost:3001';
const adminEmail = process.env.ADMIN_EMAIL || process.env.CI_ADMIN_EMAIL || 'admin@aagam.com';
const adminPassword = process.env.ADMIN_PASSWORD || process.env.CI_ADMIN_PASSWORD || 'admin@2026!';
const storeEmail = process.env.STORE_EMAIL || process.env.CI_STORE_EMAIL || 'store@aagam.com';
const storePassword = process.env.STORE_PASSWORD || process.env.CI_STORE_PASSWORD || 'store@2026!';
const PROOF_DIR = path.resolve(__dirname, '../../../docs/qa/public-promotions-store-inventory');

function makeProduct(i: number) {
  return {
    id: `page-prod-${i}`,
    name: `Paginated Product ${i}`,
    price: 100 + i,
    pricePaise: (100 + i) * 100,
    mrpPaise: (100 + i) * 100,
    image: null,
    category: { id: 'cat-1', name: 'Test' },
  };
}

async function storeBearer(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { identifier: storeEmail, password: storePassword },
  });
  expect(login.ok(), `Store login failed: ${await login.text()}`).toBeTruthy();
  return (await login.json()).access_token as string;
}

test.describe('Store inventory pagination', () => {
  test.beforeAll(async () => {
    mkdirSync(PROOF_DIR, { recursive: true });
  });

  test('loads products from multiple pages and sends pageSize <= 50', async ({
    page,
    request,
  }) => {
    const capturedPageSizeValues: number[] = [];
    const patchBodies: any[] = [];

    const PAGE_SIZE = 50;
    const page1Products = Array.from({ length: PAGE_SIZE }, (_, i) => makeProduct(i));
    const page2Products = Array.from({ length: 20 }, (_, i) => makeProduct(PAGE_SIZE + i));
    const allProducts = [...page1Products, ...page2Products];

    // Intercept product requests
    await page.route('**/products?**', async (route) => {
      const url = new URL(route.request().url());
      const ps = Number(url.searchParams.get('pageSize') || 12);
      const pg = Number(url.searchParams.get('page') || 1);
      capturedPageSizeValues.push(ps);

      if (pg === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: page1Products,
            page: 1,
            pageSize: PAGE_SIZE,
            total: 70,
            totalPages: 2,
          }),
        });
      } else if (pg === 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: page2Products,
            page: 2,
            pageSize: PAGE_SIZE,
            total: 70,
            totalPages: 2,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], page: pg, pageSize: PAGE_SIZE, total: 70, totalPages: 2 }),
        });
      }
    });

    // Intercept my-stores
    await page.route('**/stores/my-stores', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'test-store-1',
            name: 'PW Test Store',
            inventory: [],
          },
        ]),
      });
    });

    // Capture PATCH requests
    await page.route('**/stores/*/inventory', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBodies.push(JSON.parse(route.request().postData() || '{}'));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'inv-1',
            quantity: route.request().postDataJSON()?.quantity ?? 0,
            isListed: true,
            autoHideWhenOutOfStock: true,
            sellingPricePaise: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Login as store owner to access inventory page
    await page.goto('/login');
    await page.getByRole('button', { name: 'Password' }).click();
    await page.getByLabel('Phone number or email').fill(storeEmail);
    await page.getByLabel('Password', { exact: true }).fill(storePassword);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/store**', { timeout: 20000 });

    await page.goto('/store/inventory');
    await page.waitForLoadState('networkidle');

    // Verify page 2 product appears
    const page2Product = page.getByText('Paginated Product 60').first();
    await expect(page2Product).toBeVisible({ timeout: 15000 });

    // Verify page 1 product also appears
    const page1Product = page.getByText('Paginated Product 5').first();
    await expect(page1Product).toBeVisible();

    // Assert no request sent pageSize > 50
    for (const ps of capturedPageSizeValues) {
      expect(ps).toBeLessThanOrEqual(50);
    }
    // At least 2 pages were requested
    expect(capturedPageSizeValues.length).toBeGreaterThanOrEqual(2);

    await page.screenshot({
      path: path.join(PROOF_DIR, '04-store-inventory-admin-products.png'),
      fullPage: true,
    });

    // Verify PATCH body contains correct fields
    expect(patchBodies.length).toBe(1);
    expect(patchBodies[0]).toMatchObject({
      productId: expect.any(String),
      quantity: expect.any(Number),
      isListed: true,
      autoHideWhenOutOfStock: true,
    });
  });
});
