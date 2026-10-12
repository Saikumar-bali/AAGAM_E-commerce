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
      { name: 'Customers', href: '/admin/customers' },
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
    await expect(desktopNavigation.locator('a')).toHaveCount(21);
    await expect(desktopNavigation.locator('a[href="/admin/customers"]')).toBeVisible();
    await expect(desktopNavigation.locator('a[href="/admin/subscriptions"]')).toBeVisible();
    await expect(desktopNavigation.locator('a[href="/admin/route-planning"]')).toBeVisible();
    await expect(desktopNavigation.locator('a[href="/admin/live-tracking"]')).toBeVisible();
    await expect(desktopNavigation.locator('a[href="/admin/delivery-fee-rules"]')).toBeVisible();
    await expect(desktopNavigation.locator('a[href="/admin/localities"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open all navigation' })).toBeHidden();

    await page.screenshot({
      path: path.join(PROOF_DIR, 'admin-desktop-sidebar.png'),
      fullPage: true,
    });
  });

  test('admin desktop sidebar collapses to an icon rail and remembers the choice', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginWithCookieSession(page, 'ADMIN');
    await page.goto('/admin');

    const sidebar = page.locator('#primary-sidebar');
    const desktopNavigation = page.getByRole('navigation', { name: 'Admin navigation' });
    await expect(sidebar).toBeVisible();
    await expect(desktopNavigation).toBeVisible();

    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect
      .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(80);

    // Collapsing hides the labels only — every destination stays reachable.
    await expect(desktopNavigation.locator('a')).toHaveCount(21);
    await expect(desktopNavigation.getByText('Navigation', { exact: true })).toBeHidden();
    await expect(desktopNavigation.locator('a[href="/admin/live-tracking"]')).toBeVisible();

    await page.screenshot({
      path: path.join(PROOF_DIR, 'admin-desktop-sidebar-collapsed.png'),
      fullPage: true,
    });

    // The preference survives a reload.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect
      .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(80);

    // And it expands back.
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await expect(sidebar).not.toHaveAttribute('data-collapsed');
    await expect
      .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(240);
    await expect(desktopNavigation.getByText('Navigation', { exact: true })).toBeVisible();
  });

  test('store desktop sidebar offers the same collapse, rider keeps the fixed rail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginWithCookieSession(page, 'STORE_OWNER');
    await page.goto('/store');

    const storeSidebar = page.locator('#primary-sidebar');
    await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(storeSidebar).toHaveAttribute('data-collapsed', 'true');
    await expect
      .poll(async () => (await storeSidebar.boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(80);

    await loginWithCookieSession(page, 'RIDER');
    await page.goto('/rider');
    await expect(page.getByRole('navigation', { name: 'Rider navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeHidden();
    await expect
      .poll(async () => (await page.locator('#primary-sidebar').boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(240);
  });

  test('folded sidebar never flashes expanded while navigating menu items', async ({ page }) => {
    // Every page mounts <DashboardLayout> itself, so each navigation remounts
    // the sidebar. Regression: the remount used to paint the rail expanded
    // (useState default) and only fold it once the mount effect read
    // localStorage — a visible expand→fold flash on every menu click. The
    // high-water mark below samples the rail on every animation frame, so even
    // a single painted frame at the expanded width fails the test.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginWithCookieSession(page, 'ADMIN');
    await page.goto('/admin');

    const sidebar = page.locator('#primary-sidebar');
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    // Wait out the 200ms width transition from the collapse click, so that
    // animation cannot leak into the high-water mark below.
    await expect
      .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
      .toBeLessThanOrEqual(80);

    await page.evaluate(() => {
      const state = window as unknown as { hwm: number; raf: number };
      state.hwm = 0;
      const sample = () => {
        const el = document.getElementById('primary-sidebar');
        if (el) state.hwm = Math.max(state.hwm, el.getBoundingClientRect().width);
        state.raf = requestAnimationFrame(sample);
      };
      state.raf = requestAnimationFrame(sample);
    });

    for (const href of ['/admin/stores', '/admin/orders', '/admin/live-tracking', '/admin']) {
      await sidebar.locator(`a[href="${href}"]`).click();
      await page.waitForURL(`**${href}`, { timeout: 15000 });
      await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    }

    const highWater = await page.evaluate(() => (window as unknown as { hwm: number }).hwm);
    await page.evaluate(() => cancelAnimationFrame((window as unknown as { raf: number }).raf));
    // The collapsed rail is 76px; anything near the expanded 260px means a
    // frame rendered without the stored preference.
    expect(highWater).toBeLessThanOrEqual(80);
  });
});
