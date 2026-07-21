import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { loginWithCookieSession } from '../tests/helpers/login';

const PROOF_DIR = path.resolve(__dirname, '../../../docs/qa/store-assortment-inventory');

const store = {
  id: 'store-1',
  name: 'Aagam Test Store',
  address: 'Madhapur, Hyderabad',
  isActive: true,
  inventory: [{ productId: 'product-milk', quantity: 8 }],
};
const milk = {
  id: 'inventory-1',
  storeId: store.id,
  productId: 'product-milk',
  quantity: 8,
  isListed: true,
  autoHideWhenOutOfStock: true,
  sellingPricePaise: 2900,
  product: {
    id: 'product-milk',
    name: 'Fresh Milk 500 ml',
    description: 'Daily fresh milk',
    price: 30,
    pricePaise: 3000,
    mrpPaise: 3200,
    categoryId: 'dairy',
    category: { id: 'dairy', name: 'Dairy' },
    image: null,
    isActive: true,
    sortOrder: 1,
  },
};
const bread = {
  id: 'product-bread',
  name: 'Whole Wheat Bread',
  description: 'Fresh whole wheat loaf',
  price: 42,
  pricePaise: 4200,
  mrpPaise: 4500,
  categoryId: 'bakery',
  category: { id: 'bakery', name: 'Bakery' },
  image: null,
  isActive: true,
  sortOrder: 2,
};

async function installInventoryMocks(page: import('@playwright/test').Page) {
  let assortment: any[] = [{ ...milk }];
  let catalogue: any[] = [{ ...bread }];

  await page.route('**/stores/my-stores', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([store]) });
  });

  await page.route('**/stores/store-1/assortment', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const created = {
        id: 'inventory-2',
        storeId: store.id,
        productId: body.productId,
        quantity: body.openingQuantity,
        isListed: body.isListed,
        autoHideWhenOutOfStock: body.autoHideWhenOutOfStock,
        sellingPricePaise: body.sellingPrice == null ? null : Math.round(body.sellingPrice * 100),
        product: bread,
      };
      assortment = [...assortment, created];
      catalogue = catalogue.filter((product) => product.id !== body.productId);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assortment) });
  });

  await page.route('**/stores/store-1/catalog**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: catalogue, page: 1, pageSize: 50, total: catalogue.length, totalPages: 1 }),
    });
  });

  await page.route('**/stores/store-1/inventory', async (route) => {
    const body = route.request().postDataJSON();
    const current = assortment.find((item) => item.productId === body.productId);
    const updated = {
      ...current,
      quantity: body.quantity,
      isListed: body.isListed,
      autoHideWhenOutOfStock: body.autoHideWhenOutOfStock,
      sellingPricePaise: body.sellingPrice == null ? null : Math.round(body.sellingPrice * 100),
    };
    assortment = assortment.map((item) => item.productId === body.productId ? updated : item);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
  });
}

async function installAdminCatalogueMocks(page: import('@playwright/test').Page) {
  await page.route('**/admin/products', async (route) => {
    if (route.request().resourceType() === 'document') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([milk.product, bread]),
    });
  });
  await page.route('**/products/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([milk.product.category, bread.category]),
    });
  });
  await page.route('**/stores', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([store]) });
  });
}

test.describe('Store assortment and inventory ownership', () => {
  test.beforeAll(() => mkdirSync(PROOF_DIR, { recursive: true }));

  test('store owner adds an Admin product with opening stock and then updates it on mobile web', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginWithCookieSession(page, 'STORE_OWNER');
    await installInventoryMocks(page);
    await page.goto('/store/inventory');

    await expect(page.getByRole('heading', { name: 'Products & inventory' })).toBeVisible();
    await expect(page.getByTestId('my-products-grid')).toContainText('Fresh Milk 500 ml');
    await expect(page.getByTestId('my-products-grid')).not.toContainText('Whole Wheat Bread');

    await page.getByTestId('add-products-tab').click();
    await expect(page.getByTestId('catalogue-grid')).toContainText('Whole Wheat Bread');
    await page.getByLabel('Whole Wheat Bread opening stock').fill('18');
    await page.getByLabel('Whole Wheat Bread new store price').fill('41');
    await page.getByRole('button', { name: 'Add to store' }).click();

    await expect(page.getByText('Whole Wheat Bread added to this store with 18 opening units.')).toBeVisible();
    await expect(page.getByTestId('my-products-grid')).toContainText('Whole Wheat Bread');
    const breadCard = page.getByRole('article').filter({ hasText: 'Whole Wheat Bread' });
    await breadCard.getByRole('spinbutton', { name: 'Whole Wheat Bread stock', exact: true }).fill('22');
    await breadCard.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Whole Wheat Bread inventory updated.')).toBeVisible();

    await page.screenshot({ path: path.join(PROOF_DIR, 'store-inventory-mobile.png'), fullPage: true });
  });

  test('desktop separates carried products from the remaining Admin catalogue without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginWithCookieSession(page, 'STORE_OWNER');
    await installInventoryMocks(page);
    await page.goto('/store/inventory');

    await expect(page.getByTestId('my-products-grid')).toContainText('Fresh Milk 500 ml');
    await page.getByTestId('add-products-tab').click();
    await expect(page.getByTestId('catalogue-grid')).toContainText('Whole Wheat Bread');
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);

    await page.screenshot({ path: path.join(PROOF_DIR, 'store-inventory-desktop.png'), fullPage: true });
  });

  test('Admin can review selected-store availability but cannot edit ordinary stock', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginWithCookieSession(page, 'ADMIN');
    await installAdminCatalogueMocks(page);
    await page.goto('/admin/products');

    await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible();
    const milkOverview = page.getByTestId('admin-stock-overview-product-milk');
    await expect(milkOverview).toContainText('8 units');
    await expect(milkOverview).toContainText('Managed by the Store Owner');
    await expect(milkOverview.getByRole('spinbutton')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Save$/ })).toHaveCount(0);

    const breadOverview = page.getByTestId('admin-stock-overview-product-bread');
    await expect(breadOverview).toContainText('0 units');

    await page.screenshot({ path: path.join(PROOF_DIR, 'admin-inventory-read-only.png'), fullPage: true });
  });
});
