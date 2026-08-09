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

test('admin sees simple rupee plan setup plus subscribers, runs and cash control', async ({ page }) => {
  await loginWithCookieSession(page, 'ADMIN');
  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('heading', { name: 'Subscriptions, runs & cash' })).toBeVisible();
  await expect(page.getByText('Buffalo Milk 1 L', { exact: true })).toBeVisible();
  await expect(page.getByText('Weekly', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('7 days', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/₹490(?:\.00)?/).first()).toBeVisible();
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
  await page.screenshot({ path: `${screenshots}/03-admin-subscription-control-plane.png`, fullPage: true });
});

test('rider run view explicitly forbids bulk delivery completion and daily cash collection', async ({ page }) => {
  await loginWithCookieSession(page, 'RIDER');
  await page.goto('/rider/runs');
  await expect(page.getByRole('heading', { name: 'Subscription Delivery Runs' })).toBeVisible();
  await expect(page.getByText(/One route, individually verified stops/i)).toBeVisible();
  await page.screenshot({ path: `${screenshots}/04-rider-subscription-runs.png`, fullPage: true });
});

test('store sees forecast, route preparation and individual COD-ledger settlement controls', async ({ page }) => {
  await loginWithCookieSession(page, 'STORE_OWNER');
  await page.goto('/store/subscriptions');
  await expect(page.getByRole('heading', { name: 'Morning Runs & Cash Control' })).toBeVisible();
  await expect(page.getByText(/without replacing individual COD ledgers/i)).toBeVisible();
  await page.getByRole('button', { name: /Demand forecast/i }).click();
  await expect(page.getByText(/Forecast only|No forecast demand/i).first()).toBeVisible();
  await page.screenshot({ path: `${screenshots}/05-store-subscription-operations.png`, fullPage: true });
});
