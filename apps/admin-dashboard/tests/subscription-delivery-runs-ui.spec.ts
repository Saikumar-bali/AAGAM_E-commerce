import { expect, test } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import { loginWithCookieSession } from './helpers/login';

const screenshots = path.resolve(__dirname, '../../../docs/qa/phase-4/subscriptions');
mkdirSync(screenshots, { recursive: true });

test('customer sees truthful subscription funding, progress and plan discovery', async ({ page }) => {
  await loginWithCookieSession(page, 'CUSTOMER');
  await page.goto('/shop/subscriptions');
  await expect(page.getByRole('heading', { name: 'My subscriptions' })).toBeVisible();
  await expect(page.getByText('Buffalo Milk 1 L · 7 Days')).toBeVisible();
  await expect(page.getByText(/Funded stops always show ₹0 due/i)).toBeVisible();
  await page.screenshot({ path: `${screenshots}/01-customer-subscriptions.png`, fullPage: true });

  await page.goto('/shop/subscriptions/qa-customer-subscription-milk-7');
  await expect(page.getByText(/Cash due ₹490(?:\.00)?/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delivery calendar & history' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/02-customer-subscription-detail.png`, fullPage: true });
});

test('admin sees actual customer subscriptions, D-1 preparation, real plan records and readable analytics', async ({ page }) => {
  await loginWithCookieSession(page, 'ADMIN');
  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('heading', { name: 'Subscriptions, runs & cash' })).toBeVisible();

  // The route now opens on operational customer subscriptions instead of plan cadence placeholders.
  await expect(page.getByRole('heading', { name: 'Customer subscriptions' })).toBeVisible();
  await expect(page.getByText('Buffalo Milk 1 L · 7 Days').first()).toBeVisible();

  // D-1 control is mounted directly on subscription operations and exposes the
  // configurable JIT materialization lead without bulk-reserving inventory.
  await page.getByRole('button', { name: 'Open tomorrow subscription operations' }).click();
  await expect(page.getByRole('heading', { name: 'Tomorrow subscriptions' })).toBeVisible();
  await expect(page.getByText('Order materialization lead')).toBeVisible();
  await expect(page.getByText(/never bulk-reserves the full subscription/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // Plans shows one card per persisted plan. It must not synthesize missing Weekly/Monthly slots.
  await page.getByRole('button', { name: 'Plans', exact: true }).click();
  await expect(page.getByText('Buffalo Milk 1 L · 7 Days').first()).toBeVisible();
  await expect(page.getByText('Not created yet')).toHaveCount(0);
  await page.screenshot({ path: `${screenshots}/03-admin-subscription-control-plane.png`, fullPage: true });

  // Prisma groupBy arrays are rendered as semantic metrics/tables, never raw JSON.
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Subscription analytics' })).toBeVisible();
  await expect(page.getByText('Upcoming 7-day demand')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('"_count"');
  await expect(page.locator('body')).not.toContainText('"_sum"');

  await page.getByRole('button', { name: 'New plan' }).click();
  await expect(page.getByRole('heading', { name: 'Create subscription plan' })).toBeVisible();
  await expect(page.getByText(/Technical codes, paise conversion and scheduler defaults are handled automatically/i)).toBeVisible();
  await expect(page.getByText('Upload plan image')).toBeVisible();
  await expect(page.getByText('Plan price (₹)')).toBeVisible();
  await expect(page.getByText('MRP (₹)')).toBeVisible();
  await expect(page.getByText('Delivery from')).toBeVisible();
  await expect(page.getByText('Delivery until')).toBeVisible();
  await expect(page.getByText(/Amounts are shown in rupees here and safely converted to paise/i)).toBeVisible();

  await expect(page.getByText('Code', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Internal name', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Price \(paise\)|MRP \(paise\)|Slot start minute|Generate hours|Skip cutoff/i)).toHaveCount(0);
});

test('rider run view explicitly forbids bulk delivery completion and daily cash collection', async ({ page }) => {
  await loginWithCookieSession(page, 'RIDER');
  await page.goto('/rider/runs');
  await expect(page.getByRole('heading', { name: 'Subscription Delivery Runs' })).toBeVisible();
  await expect(page.getByText(/One route, individually verified stops/i)).toBeVisible();
  await page.screenshot({ path: `${screenshots}/04-rider-subscription-runs.png`, fullPage: true });
});

test('store sees D-1 stock readiness, forecast, route preparation and individual COD-ledger settlement controls', async ({ page }) => {
  await loginWithCookieSession(page, 'STORE_OWNER');
  await page.goto('/store/subscriptions');
  await expect(page.getByRole('heading', { name: 'Morning Runs & Cash Control' })).toBeVisible();
  await expect(page.getByText(/without replacing individual COD ledgers/i)).toBeVisible();

  await page.getByRole('button', { name: 'Open tomorrow subscription preparation' }).click();
  await expect(page.getByRole('heading', { name: 'Prepare before delivery day' })).toBeVisible();
  await expect(page.getByText(/Inventory is deducted only when the real subscription order is generated/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /Demand forecast/i }).click();
  await expect(page.getByText(/Forecast only|No forecast demand/i).first()).toBeVisible();
  await page.screenshot({ path: `${screenshots}/05-store-subscription-operations.png`, fullPage: true });
});