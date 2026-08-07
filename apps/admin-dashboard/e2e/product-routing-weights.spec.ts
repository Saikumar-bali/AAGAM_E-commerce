import { expect, test } from '@playwright/test';
import { loginWithCookieSession } from '../tests/helpers/login';

const missingMilk = {
  id: 'product-milk',
  name: 'Aagaam Cow Milk',
  description: 'Fresh milk',
  image: null,
  weightGrams: null,
  details: { weight: '500 ml' },
  isActive: true,
  category: { id: 'dairy', name: 'Dairy' },
};

const readyBread = {
  id: 'product-bread',
  name: 'Whole Wheat Bread',
  description: 'Bread loaf',
  image: null,
  weightGrams: 450,
  details: { weight: '450 g' },
  isActive: true,
  category: { id: 'bakery', name: 'Bakery' },
};

test.describe('Admin product routing weight maintenance', () => {
  test('repairs a missing authoritative routing weight without interpreting free-text volume', async ({ page }) => {
    let savedWeight: number | null = null;

    await loginWithCookieSession(page, 'ADMIN');
    await page.route('**/admin/products', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ...missingMilk, weightGrams: savedWeight },
          readyBread,
        ]),
      });
    });
    await page.route('**/admin/products/product-milk/weight', async (route) => {
      const body = route.request().postDataJSON();
      savedWeight = Number(body.weightGrams);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...missingMilk, weightGrams: savedWeight }),
      });
    });

    await page.goto('/admin/products/routing-weights');

    await expect(page.getByRole('heading', { name: 'Product routing weights' })).toBeVisible();
    await expect(page.getByText('Subscriptions remain blocked for products without routing weight.')).toBeVisible();
    const milkRow = page.getByTestId('routing-weight-product-milk');
    await expect(milkRow).toContainText('500 ml');
    await expect(milkRow).toContainText('Informational only; not used by routing.');
    await expect(milkRow).toContainText('Weight required');

    await page.getByRole('spinbutton', { name: 'Routing weight for Aagaam Cow Milk' }).fill('515');
    await milkRow.getByRole('button', { name: 'Save' }).click();

    expect(savedWeight).toBe(515);
    await expect(milkRow).toContainText('Routing-ready');
    await expect(milkRow.getByRole('button', { name: 'Saved' })).toBeVisible();
  });

  test('exposes routing-weight maintenance from the existing Products area', async ({ page }) => {
    await loginWithCookieSession(page, 'ADMIN');
    await page.route('**/admin/products', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([readyBread]) });
    });
    await page.route('**/products/categories', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/stores', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    await page.goto('/admin/products');
    const shortcut = page.getByRole('link', { name: 'Maintain product routing weights' });
    await expect(shortcut).toBeVisible();
    await shortcut.click();
    await expect(page).toHaveURL(/\/admin\/products\/routing-weights$/);
    await expect(page.getByRole('heading', { name: 'Product routing weights' })).toBeVisible();
  });
});
