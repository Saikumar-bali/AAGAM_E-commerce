import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { loginWithCookieSession } from '../tests/helpers/login';
import type { QaRole } from '../tests/helpers/login';

const PROOF_DIR = path.resolve(__dirname, '../../../docs/qa/responsive-role-navigation');

type NavigationCase = {
  role: QaRole;
  startPath: string;
  hiddenTarget: string;
  items: Array<{ name: string; href: string }>;
};

const navigationCases: NavigationCase[] = [
  {
    role: 'ADMIN',
    startPath: '/admin',
    hiddenTarget: '/admin/promotions',
    items: [
      { name: 'Dashboard', href: '/admin' },
      { name: 'Partner Applications', href: '/admin/partner-applications' },
      { name: 'Analytics', href: '/admin/analytics' },
      { name: 'Subscriptions', href: '/admin/subscriptions' },
      { name: 'Route Planning', href: '/admin/route-planning' },
      { name: 'Notifications', href: '/admin/notifications' },
      { name: 'Support', href: '/admin/support' },
      { name: 'Dispatch', href: '/admin/dispatch' },
      { name: 'Delivery Exceptions', href: '/admin/delivery-exceptions' },
      { name: 'Stores', href: '/admin/stores' },
      { name: 'Products', href: '/admin/products' },
      { name: 'Delivery Zones', href: '/admin/delivery-zones' },
      { name: 'Promotions', href: '/admin/promotions' },
      { name: 'Riders', href: '/admin/riders' },
      { name: 'Orders', href: '/admin/orders' },
      { name: 'Live Tracking', href: '/admin/live-tracking' },
    ],
  },
  {
    role: 'RIDER',
    startPath: '/rider',
    hiddenTarget: '/rider/earnings',
    items: [
      { name: 'Home', href: '/rider' },
      { name: 'Job Offers', href: '/rider/offers' },
      { name: 'Current Delivery', href: '/rider/delivery' },
      { name: 'Pickup Tasks', href: '/rider/pickup' },
      { name: 'Notifications', href: '/rider/notifications' },
      { name: 'History', href: '/rider/history' },
      { name: 'Earnings', href: '/rider/earnings' },
      { name: 'COD & Settlements', href: '/rider/cod' },
      { name: 'Performance', href: '/rider/performance' },
      { name: 'Availability', href: '/rider/availability' },
      { name: 'Profile', href: '/rider/profile' },
      { name: 'Support', href: '/rider/support' },
    ],
  },
  {
    role: 'CUSTOMER',
    startPath: '/shop',
    hiddenTarget: '/shop/wishlist',
    items: [
      { name: 'Shop', href: '/shop' },
      { name: 'My Orders', href: '/shop/orders' },
      { name: 'Notifications', href: '/shop/notifications' },
      { name: 'Addresses', href: '/shop/addresses' },
      { name: 'Wishlist', href: '/shop/wishlist' },
      { name: 'Deals', href: '/shop/deals' },
      { name: 'Reorder', href: '/shop/reorder' },
      { name: 'Account', href: '/shop/account' },
    ],
  },
  {
    role: 'STORE_OWNER',
    startPath: '/store',
    hiddenTarget: '/store/inventory',
    items: [
      { name: 'Dashboard', href: '/store' },
      { name: 'Notifications', href: '/store/notifications' },
      { name: 'Orders', href: '/store/orders' },
      { name: 'Pickup Proof', href: '/store/pickup-proof' },
      { name: 'Inventory', href: '/store/inventory' },
      { name: 'My Stores', href: '/store/stores' },
    ],
  },
];

test.describe('Responsive role navigation', () => {
  test.beforeAll(() => {
    mkdirSync(PROOF_DIR, { recursive: true });
  });

  for (const navigationCase of navigationCases) {
    test(`${navigationCase.role} can access every authorized menu item on mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await loginWithCookieSession(page, navigationCase.role);
      await page.goto(navigationCase.startPath);

      const quickNavigation = page.getByRole('navigation', { name: 'Quick navigation' });
      await expect(quickNavigation).toBeVisible();
      await expect(quickNavigation.getByRole('link')).toHaveCount(4);

      const openAllNavigation = page.getByRole('button', { name: 'Open all navigation' });
      await expect(openAllNavigation).toBeVisible();
      await openAllNavigation.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeVisible();

      for (const item of navigationCase.items) {
        await expect(dialog.locator(`a[href="${item.href}"]`)).toHaveCount(1);
      }

      const drawerHasHorizontalOverflow = await page.locator('#responsive-role-navigation').evaluate(
        (drawer) => drawer.scrollWidth > drawer.clientWidth,
      );
      expect(drawerHasHorizontalOverflow).toBe(false);

      await page.screenshot({
        path: path.join(PROOF_DIR, `${navigationCase.role.toLowerCase()}-mobile-menu.png`),
        fullPage: true,
      });

      const hiddenTarget = dialog.locator(`a[href="${navigationCase.hiddenTarget}"]`);
      await hiddenTarget.scrollIntoViewIfNeeded();
      await expect(hiddenTarget).toBeVisible();
      await hiddenTarget.click();

      await expect(page).toHaveURL(new RegExp(`${navigationCase.hiddenTarget.replaceAll('/', '\\/')}(?:$|\\?)`));
      await expect(dialog).toBeHidden();
    });
  }

  test('admin tablet traps focus, restores focus, and supports Escape close', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await loginWithCookieSession(page, 'ADMIN');
    await page.goto('/admin');

    const trigger = page.getByRole('button', { name: 'Open all navigation' });
    const quickNavigation = page.getByRole('navigation', { name: 'Quick navigation' });
    await trigger.click();

    const dialog = page.getByRole('dialog');
    const closeButton = dialog.getByRole('button', { name: 'Close all navigation' });
    const signOutButton = dialog.getByRole('button', { name: 'Sign out' });
    const firstDrawerLink = dialog.locator('#responsive-role-navigation a[href="/"]').first();
    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await expect(quickNavigation).toHaveAttribute('inert', '');

    const drawer = page.locator('#responsive-role-navigation');
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(480);
    expect(box!.x).toBeGreaterThan(0);
    await expect(dialog.locator('a[href="/admin/live-tracking"]')).toHaveCount(1);

    await firstDrawerLink.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(signOutButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(firstDrawerLink).toBeFocused();

    await page.screenshot({
      path: path.join(PROOF_DIR, 'admin-tablet-menu.png'),
      fullPage: true,
    });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    await expect(quickNavigation).not.toHaveAttribute('inert', '');
  });

  test('admin desktop keeps the complete sidebar and hides mobile controls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginWithCookieSession(page, 'ADMIN');
    await page.goto('/admin');

    const desktopNavigation = page.getByRole('navigation', { name: 'Admin navigation' });
    await expect(desktopNavigation).toBeVisible();
    await expect(desktopNavigation.locator('a')).toHaveCount(16);
    await expect(desktopNavigation.locator('a[href="/admin/subscriptions"]')).toBeVisible();
    await expect(desktopNavigation.locator('a[href="/admin/route-planning"]')).toBeVisible();
    await expect(desktopNavigation.locator('a[href="/admin/live-tracking"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open all navigation' })).toBeHidden();

    await page.screenshot({
      path: path.join(PROOF_DIR, 'admin-desktop-sidebar.png'),
      fullPage: true,
    });
  });
});
