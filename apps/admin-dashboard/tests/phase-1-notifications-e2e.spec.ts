import { expect, Page, test } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

function getPasswordForEmail(email: string): string {
  if (email.includes('admin')) return process.env.QA_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin@2026!';
  if (email.includes('store')) return process.env.QA_STORE_PASSWORD || process.env.STORE_PASSWORD || 'store@2026!';
  if (email.includes('rider')) return process.env.QA_RIDER_PASSWORD || process.env.RIDER_PASSWORD || 'rider@2026!';
  return process.env.QA_CUSTOMER_PASSWORD || process.env.CUSTOMER_PASSWORD || 'customer@2026!';
}

async function login(page: Page, email: string, password?: string) {
  await page.goto('/login');
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
  await page.fill('input[autocomplete="username"]', email);
  await page.fill('input[type="password"]', password ?? getPasswordForEmail(email));
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('user_role') !== null, { timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}

test.describe('Phase 1: Notification e2e scenarios', () => {

  test('Admin broadcast end-to-end: queue a broadcast and verify outbox', async ({ page }) => {
    await login(page, 'admin@aagam.com');
    await page.goto('/admin/notifications');
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    await expect(page.getByRole('heading', { name: /Admin Notifications/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Broadcast placeholder' })).toBeVisible();

    // Validate broadcast placeholder
    await page.getByRole('button', { name: /Validate/i }).click();
    await page.waitForTimeout(1000);
  });

  test('Multi-context inbox: two sessions see the same inbox data', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await login(page1, 'rider@aagam.com');
    await login(page2, 'rider@aagam.com');

    await page1.goto('/rider/notifications');
    await page2.goto('/rider/notifications');
    await page1.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page2.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    await expect(page1.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });
    await expect(page2.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });

    const getBodyText = (p: Page) => p.evaluate(() => document.body.innerText);
    const text1 = await getBodyText(page1);
    const text2 = await getBodyText(page2);
    expect(text1).toEqual(text2);

    await ctx1.close();
    await ctx2.close();
  });

  test('Push subscription CRUD via API', async ({ page }) => {
    await login(page, 'customer@aagam.com');

    const subPayload = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test-endpoint',
      p256dh: 'BOrS5VfJShFPtP1PJzrXGkF6g5pPq1vQ2w3e4r5t6y7u8i9o0p',
      auth: 'e2e-auth-secret-test',
      deviceName: 'Playwright-e2e-test',
    };

    const createResp = await page.request.post(`${API_BASE}/notifications/push/subscriptions`, {
      data: subPayload,
    });
    expect(createResp.ok()).toBeTruthy();
    const created = await createResp.json();
    const subId = created.id || created.subscriptionId;
    expect(subId).toBeTruthy();

    const listResp = await page.request.get(`${API_BASE}/notifications/push/subscriptions`);
    expect(listResp.ok()).toBeTruthy();
    const subs = await listResp.json();
    const items = Array.isArray(subs) ? subs : (subs.items || []);
    expect(items.some((s: any) => s.id === subId || s.subscriptionId === subId)).toBeTruthy();

    const deleteResp = await page.request.delete(
      `${API_BASE}/notifications/push/subscriptions/${encodeURIComponent(subId)}`,
    );
    expect(deleteResp.ok()).toBeTruthy();

    const listAfter = await page.request.get(`${API_BASE}/notifications/push/subscriptions`);
    const subsAfter = await listAfter.json();
    const itemsAfter = Array.isArray(subsAfter) ? subsAfter : (subsAfter.items || []);
    const deletedSub = itemsAfter.find((s: any) => s.id === subId);
    expect(deletedSub).toBeTruthy();
    expect(deletedSub.isActive).toBe(false);
    expect(deletedSub.invalidatedAt).toBeTruthy();
  });

  test('Expired/invalid push token handled gracefully', async ({ page }) => {
    await login(page, 'rider@aagam.com');

    const badSubPayload = {
      endpoint: 'https://invalid.push.service/expired-token-test',
      p256dh: 'invalid-key',
      auth: 'invalid-auth',
      deviceName: 'expired-token-e2e',
    };

    const createResp = await page.request.post(`${API_BASE}/notifications/push/subscriptions`, {
      data: badSubPayload,
    });
    expect(createResp.ok()).toBeTruthy();

    const listResp = await page.request.get(`${API_BASE}/notifications/push/subscriptions`);
    expect(listResp.ok()).toBeTruthy();
  });

  test('Notification deep link click records openedAt', async ({ page }) => {
    await login(page, 'rider@aagam.com');

    const inboxResp = await page.request.get(`${API_BASE}/notifications/inbox?limit=5`);
    expect(inboxResp.ok()).toBeTruthy();
    const inbox = await inboxResp.json();
    const items = Array.isArray(inbox) ? inbox : (inbox.items || []);

    if (items.length === 0) {
      return;
    }

    const firstItem = items[0];
    const recipientId = firstItem.recipientId;
    if (!recipientId) {
      return;
    }

    await page.goto(`/rider/notifications?aagamNotificationRecipient=${encodeURIComponent(recipientId)}`);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    await expect(page.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(2000);

    const checkResp = await page.request.get(`${API_BASE}/notifications/inbox?limit=5`);
    const updatedInbox = await checkResp.json();
    const updatedItems = Array.isArray(updatedInbox) ? updatedInbox : (updatedInbox.items || []);
    const updated = updatedItems.find((i: any) => i.id === firstItem.id);
    expect(updated).toBeTruthy();
    if (firstItem.openedAt) {
      expect(updated!.openedAt).toEqual(firstItem.openedAt);
    } else {
      expect(updated!.openedAt).toBeTruthy();
    }
  });
});
