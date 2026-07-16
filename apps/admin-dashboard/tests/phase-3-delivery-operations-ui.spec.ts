import { expect, test } from '@playwright/test';
import path from 'path';
import { loginWithCookieSession } from './helpers/login';

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/phase-3-delivery-operations');

test.describe('Phase 3: Delivery operations UI', () => {
  test('admin exception command centre renders and exposes safe queues', async ({ page }) => {
    await loginWithCookieSession(page, 'ADMIN');
    await page.goto('/admin/delivery-exceptions');
    await expect(page.getByRole('heading', { name: 'Delivery Exceptions' })).toBeVisible();
    await expect(page.getByText('Failed attempts', { exact: true })).toBeVisible();
    await expect(page.getByText('Returning parcels', { exact: true })).toBeVisible();
    await expect(page.getByText('Awaiting inspection', { exact: true })).toBeVisible();
    await expect(page.getByText('COD settlements', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'RETURNS' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'COD' })).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-admin-delivery-exceptions.png`, fullPage: true });
  });

  test('admin exception page has no mobile horizontal overflow', async ({ page }) => {
    await loginWithCookieSession(page, 'ADMIN');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/delivery-exceptions');
    await expect(page.getByRole('heading', { name: 'Delivery Exceptions' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-admin-mobile.png`, fullPage: true });
  });

  test('customer delivery code route keeps the code customer-scoped', async ({ page }) => {
    await loginWithCookieSession(page, 'CUSTOMER');
    await page.goto('/shop/delivery-code/non-existent-proof-job');
    await expect(page.getByRole('heading', { name: 'Delivery verification' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Customer-only delivery code' })).toBeVisible();
    await expect(page.getByText(/The rider cannot retrieve it from their account/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh code' })).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-customer-delivery-code.png`, fullPage: true });
  });
});
