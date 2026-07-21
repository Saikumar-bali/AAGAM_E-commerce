import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

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

test.describe('Store inventory pagination', () => {
  test.beforeAll(async () => {
    mkdirSync(PROOF_DIR, { recursive: true });
  });

  test('loads every admin product with pageSize <= 50 and saves store stock', async ({ page }) => {
    const capturedPageSizeValues: number[] = [];
    const patchBodies: any[] = [];

    const pageSize = 50;
    const page1Products = Array.from({ length: pageSize }, (_, i) => makeProduct(i));
    const page2Products = Array.from({ length: 20 }, (_, i) => makeProduct(pageSize + i));

    await page.route('**/products?**', async (route) => {
      const url = new URL(route.request().url());
      const requestedPageSize = Number(url.searchParams.get('pageSize') || 12);
      const requestedPage = Number(url.searchParams.get('page') || 1);
      capturedPageSizeValues.push(requestedPageSize);

      const items = requestedPage === 1 ? page1Products : requestedPage === 2 ? page2Products : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          page: requestedPage,
          pageSize,
          total: 70,
          totalPages: 2,
        }),
      });
    });

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

    await page.route('**/stores/*/inventory', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }

      const body = route.request().postDataJSON();
      patchBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'inv-1',
          quantity: body.quantity,
          isListed: body.isListed,
          autoHideWhenOutOfStock: body.autoHideWhenOutOfStock,
          sellingPricePaise: Math.round(body.sellingPrice * 100),
        }),
      });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Password' }).click();
    await page.getByLabel('Phone number or email').fill(storeEmail);
    await page.getByLabel('Password', { exact: true }).fill(storePassword);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/store**', { timeout: 20000 });

    await page.goto('/store/inventory');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Paginated Product 5').first()).toBeVisible();
    await expect(page.getByText('Paginated Product 60').first()).toBeVisible({ timeout: 15000 });

    expect(capturedPageSizeValues.length).toBeGreaterThanOrEqual(2);
    for (const value of capturedPageSizeValues) {
      expect(value).toBeLessThanOrEqual(50);
    }

    const targetRow = page.locator('tr').filter({ hasText: 'Paginated Product 60' }).first();
    await expect(targetRow).toBeVisible();
    const numberInputs = targetRow.locator('input[type="number"]');
    await numberInputs.nth(0).fill('120.50');
    await numberInputs.nth(1).fill('7');
    await targetRow.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Paginated Product 60 stock updated to 7 units')).toBeVisible();
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual({
      productId: 'page-prod-60',
      quantity: 7,
      isListed: true,
      autoHideWhenOutOfStock: true,
      sellingPrice: 120.5,
    });

    await page.screenshot({
      path: path.join(PROOF_DIR, '04-store-inventory-admin-products.png'),
      fullPage: true,
    });
  });
});
