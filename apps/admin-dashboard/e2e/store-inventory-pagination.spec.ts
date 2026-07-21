import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { loginWithCookieSession } from '../tests/helpers/login';

const PROOF_DIR = path.resolve(__dirname, '../../../docs/qa/public-promotions-store-inventory');

function makeProduct(i: number) {
  return {
    id: `page-prod-${i}`,
    name: `Paginated Product ${i}`,
    description: `Catalogue product ${i}`,
    price: 100 + i,
    pricePaise: (100 + i) * 100,
    mrpPaise: (100 + i) * 100,
    image: null,
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Test' },
    isActive: true,
  };
}

test.describe('Store catalogue pagination and search', () => {
  test.beforeAll(async () => {
    mkdirSync(PROOF_DIR, { recursive: true });
  });

  test('uses a capped server catalogue, finds a deep product by search, adds it, and saves stock', async ({ page }) => {
    test.setTimeout(60_000);

    const targetProduct = makeProduct(100);
    const catalogueRequests: Array<{ page: number; pageSize: number; search: string }> = [];
    const addBodies: any[] = [];
    const patchBodies: any[] = [];
    let assortment: any[] = [];

    await page.route('**/stores/my-stores', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'test-store-1', name: 'PW Test Store', address: 'QA address' }]),
      });
    });

    await page.route('**/stores/test-store-1/assortment', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        addBodies.push(body);
        const created = {
          id: 'inv-100',
          storeId: 'test-store-1',
          productId: targetProduct.id,
          quantity: body.openingQuantity,
          isListed: body.isListed,
          autoHideWhenOutOfStock: body.autoHideWhenOutOfStock,
          sellingPricePaise: Math.round(body.sellingPrice * 100),
          product: targetProduct,
        };
        assortment = [created];
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assortment) });
    });

    await page.route('**/stores/test-store-1/catalog**', async (route) => {
      const url = new URL(route.request().url());
      const pageNumber = Number(url.searchParams.get('page') || 1);
      const pageSize = Number(url.searchParams.get('pageSize') || 24);
      const search = url.searchParams.get('search') || '';
      catalogueRequests.push({ page: pageNumber, pageSize, search });

      const items = search.includes('Paginated Product 100')
        ? [targetProduct]
        : Array.from({ length: Math.min(pageSize, 50) }, (_, index) => makeProduct(index));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          page: pageNumber,
          pageSize,
          total: search ? items.length : 101,
          totalPages: search ? 1 : 3,
        }),
      });
    });

    await page.route('**/stores/test-store-1/inventory', async (route) => {
      const body = route.request().postDataJSON();
      patchBodies.push(body);
      const current = assortment[0];
      const updated = {
        ...current,
        quantity: body.quantity,
        isListed: body.isListed,
        autoHideWhenOutOfStock: body.autoHideWhenOutOfStock,
        sellingPricePaise: Math.round(body.sellingPrice * 100),
      };
      assortment = [updated];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    });

    await loginWithCookieSession(page, 'STORE_OWNER');
    await page.goto('/store/inventory');

    await page.getByTestId('add-products-tab').click();
    await expect(page.getByTestId('catalogue-grid')).toContainText('Paginated Product 0');
    await page.getByLabel('Search Admin catalogue').fill('Paginated Product 100');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByTestId('catalogue-grid')).toContainText('Paginated Product 100');

    const targetCatalogueCard = page.getByRole('article').filter({ hasText: 'Paginated Product 100' });
    await targetCatalogueCard.getByRole('spinbutton', { name: 'Paginated Product 100 opening stock', exact: true }).fill('7');
    await targetCatalogueCard.getByRole('spinbutton', { name: 'Paginated Product 100 new store price', exact: true }).fill('120.50');
    await targetCatalogueCard.getByRole('button', { name: 'Add to store', exact: true }).click();

    await expect(page.getByText('Paginated Product 100 added to this store with 7 opening units.')).toBeVisible();
    const myProductCard = page.getByRole('article').filter({ hasText: 'Paginated Product 100' });
    await myProductCard.getByRole('spinbutton', { name: 'Paginated Product 100 stock', exact: true }).fill('9');
    await myProductCard.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Paginated Product 100 inventory updated.')).toBeVisible();

    expect(catalogueRequests.length).toBeGreaterThanOrEqual(2);
    for (const request of catalogueRequests) {
      expect(request.page).toBe(1);
      expect(request.pageSize).toBeLessThanOrEqual(50);
    }
    expect(catalogueRequests.some((request) => request.search === 'Paginated Product 100')).toBe(true);
    expect(addBodies).toEqual([{
      productId: 'page-prod-100',
      openingQuantity: 7,
      sellingPrice: 120.5,
      isListed: true,
      autoHideWhenOutOfStock: true,
    }]);
    expect(patchBodies).toEqual([{
      productId: 'page-prod-100',
      quantity: 9,
      isListed: true,
      autoHideWhenOutOfStock: true,
      sellingPrice: 120.5,
    }]);

    await page.screenshot({
      path: path.join(PROOF_DIR, '04-store-inventory-admin-products.png'),
      fullPage: true,
    });
  });
});
