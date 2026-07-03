import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-6');

async function waitForReady(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}

async function selectAhmedabadAddress(page: Page) {
  const addressSelect = page.locator('select').first();
  await expect(addressSelect).toBeVisible({ timeout: 15000 });
  const options = addressSelect.locator('option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = await options.nth(i).textContent();
    if (text && text.includes('Ahmedabad')) {
      const value = await options.nth(i).getAttribute('value');
      if (value) { await addressSelect.selectOption(value); break; }
    }
  }
  await page.waitForTimeout(3000);
}

test.describe('Phase 6 Checkout UX', () => {

  test('01-serviceability: address selector shows serviceable banner', async ({ page }) => {
    await page.goto('/shop/phase6');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await selectAhmedabadAddress(page);

    const banner = page.locator('text=Serviceable').first();
    await expect(banner).toBeVisible({ timeout: 10000 });

    const pageText = await page.textContent('body');
    expect(pageText).toContain('Aagam Grocery Store');

    await waitForReady(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-serviceability.png`, fullPage: true });
  });

  test('02-search-results: search filters products', async ({ page }) => {
    await page.goto('/shop/phase6');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    const initialCards = page.locator('[class*="rounded-2xl"][class*="border"][class*="bg-white"]').filter({ hasText: /Add|Substitutes|Out/ });
    const initialCount = await initialCards.count();
    expect(initialCount).toBeGreaterThan(0);

    await searchInput.fill('milk');
    await page.waitForTimeout(2000);

    const pageText = await page.textContent('body');
    expect(pageText).toContain('Milk');

    const countText = page.locator('text=/\\d+ products/').first();
    await expect(countText).toBeVisible({ timeout: 5000 });

    await waitForReady(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-search-results.png`, fullPage: true });
  });

  test('03-category-filter: category dropdown filters products', async ({ page }) => {
    await page.goto('/shop/phase6');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const categorySelect = page.locator('select').nth(1);
    await expect(categorySelect).toBeVisible({ timeout: 15000 });

    const options = categorySelect.locator('option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(1);

    for (let i = 0; i < optionCount; i++) {
      const text = await options.nth(i).textContent();
      if (text && text !== 'All categories' && text.trim() !== '') {
        const value = await options.nth(i).getAttribute('value');
        if (value) { await categorySelect.selectOption(value); break; }
      }
    }
    await page.waitForTimeout(2000);

    const countText = page.locator('text=/\\d+ products/').first();
    await expect(countText).toBeVisible({ timeout: 5000 });

    await waitForReady(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-category-filter.png`, fullPage: true });
  });

  test('04-cart-quote: add item to cart shows quote with bill details', async ({ page }) => {
    await page.goto('/shop/phase6');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await selectAhmedabadAddress(page);

    const addButtons = page.locator('button').filter({ hasText: /^Add$/ });
    const addCount = await addButtons.count();
    expect(addCount).toBeGreaterThan(0);
    await addButtons.first().click();
    await page.waitForTimeout(1500);

    const cartSection = page.locator('text=Cart').first();
    await expect(cartSection).toBeVisible({ timeout: 5000 });

    const badge = page.locator('[class*="bg-slate-950"]').filter({ hasText: /items?/ }).first();
    await expect(badge).toBeVisible({ timeout: 5000 });

    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/Subtotal|Delivery|Total|Bill/);

    const placeOrderBtn = page.locator('button').filter({ hasText: /Place COD order/ }).first();
    await expect(placeOrderBtn).toBeVisible({ timeout: 5000 });

    await waitForReady(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-cart-quote.png`, fullPage: true });
  });

  test('05-order-created: place COD order clears cart and shows success', async ({ page }) => {
    await page.goto('/shop/phase6');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await selectAhmedabadAddress(page);

    const addButton = page.locator('button').filter({ hasText: /^Add$/ }).first();
    await addButton.click();
    await page.waitForTimeout(1500);

    const placeOrderBtn = page.locator('button').filter({ hasText: /Place COD order/ }).first();
    await expect(placeOrderBtn).toBeVisible({ timeout: 5000 });
    await placeOrderBtn.click();
    await page.waitForTimeout(3000);

    const successMsg = page.locator('text=Order created:').first();
    await expect(successMsg).toBeVisible({ timeout: 10000 });

    const msgText = await successMsg.textContent();
    expect(msgText).toMatch(/Order created: [A-Z0-9]{8}/);

    const emptyCart = page.locator('text=Add products to calculate quote').first();
    await expect(emptyCart).toBeVisible({ timeout: 5000 });

    await waitForReady(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-order-created.png`, fullPage: true });
  });

  test('06-substitutes: out-of-stock product shows substitute options', async ({ page }) => {
    await page.goto('/shop/phase6');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await selectAhmedabadAddress(page);

    const outOfStock = page.locator('text=Out').first();
    await expect(outOfStock).toBeVisible({ timeout: 10000 });

    const substituteBtn = page.locator('button').filter({ hasText: /Substitutes/ }).first();
    await expect(substituteBtn).toBeVisible({ timeout: 5000 });
    await substituteBtn.click();
    await page.waitForTimeout(2000);

    const replaceButtons = page.locator('button').filter({ hasText: /Replace with/ });
    await expect(replaceButtons.first()).toBeVisible({ timeout: 5000 });

    await waitForReady(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-substitutes.png`, fullPage: true });
  });
});
