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

  test('continues through reported page 101 and saves store stock', async ({ page }) => {
    test.setTimeout(60_000);

    const capturedPages: number[] = [];
    const capturedPageSizeValues: number[] = [];
    const patchBodies: any[] = [];
    const pageSize = 50;
    const totalPages = 101;

    await page.route('**/products?**', async (route) => {
      const url = new URL(route.request().url());
      const requestedPageSize = Number(url.searchParams.get('pageSize') || 12);
      const requestedPage = Number(url.searchParams.get('page') || 1);
      capturedPages.push(requestedPage);
      capturedPageSizeValues.push(requestedPageSize);

      const items = requestedPage <= totalPages ? [makeProduct(requestedPage - 1)] : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          page: requestedPage,
          pageSize,
          total: totalPages,
          totalPages,
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
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForURL('**/store**', { timeout: 20000 });

    await page.goto('/store/inventory');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Paginated Product 0').first()).toBeVisible();
    await expect(page.getByText('Paginated Product 100').first()).toBeVisible({ timeout: 30000 });

    expect(capturedPages).toHaveLength(totalPages);
    expect(capturedPages[0]).toBe(1);
    expect(capturedPages.at(-1)).toBe(totalPages);
    for (const value of capturedPageSizeValues) {
      expect(value).toBeLessThanOrEqual(50);
    }

    const targetRow = page.locator('tr').filter({ hasText: 'Paginated Product 100' }).first();
    await expect(targetRow).toBeVisible();
    const numberInputs = targetRow.locator('input[type="number"]');
    await numberInputs.nth(0).fill('120.50');
    await numberInputs.nth(1).fill('7');
    await targetRow.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Paginated Product 100 stock updated to 7 units')).toBeVisible();
    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual({
      productId: 'page-prod-100',
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
