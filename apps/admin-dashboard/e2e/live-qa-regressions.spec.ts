import { expect, test } from '@playwright/test';
import { loginWithCookieSession } from '../tests/helpers/login';

test.describe('Live QA regression protections', () => {
  test('shows a stable empty state when a Store Owner has no assigned stores', async ({ page }) => {
    let storeRequestCount = 0;
    await page.route('**/stores/my-stores', async (route) => {
      storeRequestCount += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await loginWithCookieSession(page, 'STORE_OWNER');
    await page.goto('/store/inventory');

    await expect(page.getByTestId('no-assigned-stores')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No stores are assigned to this account' })).toBeVisible();
    await expect(page.getByText('Contact an administrator to assign a store')).toBeVisible();
    await expect(page.locator('.animate-pulse')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'My products' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Add products' })).toHaveCount(0);

    const refresh = page.getByRole('button', { name: 'Refresh' });
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await expect.poll(() => storeRequestCount).toBeGreaterThan(1);
  });

  test('shows friendly copy instead of a raw throttler exception', async ({ page }) => {
    await page.route('**/public/promotions/active**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Phone number or email').fill('qa-store@example.invalid');
    await page.getByLabel('Password').fill('not-a-real-password');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByText('Too many login attempts. Please try again later.')).toBeVisible();
    await expect(page.getByText(/ThrottlerException|Too Many Requests/)).toHaveCount(0);
  });
});
