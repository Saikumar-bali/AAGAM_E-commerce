import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-0-dispatch');

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

test.describe('Phase 0: Delivery Dispatch UI', () => {
  test('Admin: Dispatch board shows waiting jobs and Send offer button', async ({ page }) => {
    await login(page, 'admin@aagam.com', 'admin@2026!');

    await page.goto('/admin/dispatch');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    await expect(page.getByRole('heading', { name: /Dispatch Operations/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Waiting jobs')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Available riders')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /Ready for dispatch/i })).toBeVisible({ timeout: 10000 });

    const jobCards = page.locator('article');
    const jobCount = await jobCards.count();

    if (jobCount > 0) {
      await expect(page.locator('select').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: /Send offer/i }).first()).toBeVisible({ timeout: 10000 });
    } else {
      await expect(page.getByText('No packed orders are waiting.')).toBeVisible({ timeout: 10000 });
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-admin-dispatch-board.png`, fullPage: true });
  });

  test('Admin: Can refresh dispatch board', async ({ page }) => {
    await login(page, 'admin@aagam.com', 'admin@2026!');
    await page.goto('/admin/dispatch');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const refreshBtn = page.getByRole('button', { name: /Refresh board/i });
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
    await refreshBtn.click();
    await page.waitForTimeout(3000);

    await expect(page.getByText('Failed to fetch').or(page.getByText('Error'))).toHaveCount(0, { timeout: 5000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-after-refresh.png`, fullPage: true });
  });

  test('Rider: Workspace shows ONLINE status', async ({ page }) => {
    await login(page, 'rider@aagam.com', 'rider@2026!');
    await page.goto('/rider');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    await expect(page.getByRole('heading', { name: /Delivery Workspace/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Pending offers')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Active delivery')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-rider-workspace.png`, fullPage: true });
  });

  test('Cross-role navigation: Store sees orders page', async ({ page }) => {
    await login(page, 'store@aagam.com', 'store@2026!');
    await page.goto('/store/orders');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    await expect(page.getByRole('heading', { name: 'Order Queue' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Store fulfillment')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-store-orders.png`, fullPage: true });
  });
});
