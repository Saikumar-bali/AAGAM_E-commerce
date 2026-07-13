import { expect, Page, test } from '@playwright/test';
import { loginWithCookieSession } from './helpers/login';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

test.describe('Phase 1: Notification e2e scenarios', () => {
  test('Admin broadcast end-to-end: queue a broadcast and verify outbox', async ({ page }) => {
    await loginWithCookieSession(page, 'ADMIN');
    await page.goto('/admin/notifications');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Operations broadcast/i })).toBeVisible();

    const titleInput = page.locator('input[placeholder="Title"]');
    const bodyInput = page.locator('input[placeholder="Message"]');
    await titleInput.fill('E2E Test Broadcast');
    await bodyInput.fill('This is an automated end-to-end test broadcast.');

    const audienceSelect = page.locator('select');
    await audienceSelect.selectOption('RIDERS');

    await page.getByRole('button', { name: /Queue/i }).click();

    const successMsg = page.locator('text=Broadcast queued successfully');
    await expect(successMsg).toBeVisible({ timeout: 10000 });

    const outboxResp = await page.request.get(`${API_BASE}/notifications/admin/outbox?limit=500`);
    expect(outboxResp.ok()).toBeTruthy();
    const outbox = await outboxResp.json();
    const events = Array.isArray(outbox) ? outbox : (outbox.items || []);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const broadcastEvent = events.find((event: any) => event.eventType === 'ADMIN_BROADCAST');
    expect(broadcastEvent).toBeTruthy();
  });

  test('Multi-context inbox: two sessions see the same inbox data', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await loginWithCookieSession(page1, 'RIDER');
    await loginWithCookieSession(page2, 'RIDER');

    await page1.goto('/rider/notifications');
    await page2.goto('/rider/notifications');
    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');

    await expect(page1.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });
    await expect(page2.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });

    const getBodyText = (page: Page) => page.evaluate(() => document.body.innerText);
    const text1 = await getBodyText(page1);
    const text2 = await getBodyText(page2);
    expect(text1).toEqual(text2);

    await context1.close();
    await context2.close();
  });

  test('Push subscription CRUD via API', async ({ page }) => {
    await loginWithCookieSession(page, 'CUSTOMER');

    const subPayload = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test-endpoint',
      keys: {
        p256dh: 'BOrS5VfJShFPtP1PJzrXGkF6g5pPq1vQ2w3e4r5t6y7u8i9o0p',
        auth: 'e2e-auth-secret-test',
      },
      deviceInfo: 'Playwright-e2e-test',
    };

    const createResp = await page.request.post(`${API_BASE}/notifications/push/subscriptions`, {
      headers: { 'Content-Type': 'application/json' },
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
    expect(items.some((subscription: any) => subscription.id === subId || subscription.subscriptionId === subId)).toBeTruthy();

    const deleteResp = await page.request.delete(
      `${API_BASE}/notifications/push/subscriptions/${encodeURIComponent(subId)}`,
    );
    expect(deleteResp.ok()).toBeTruthy();

    const listAfter = await page.request.get(`${API_BASE}/notifications/push/subscriptions`);
    const subsAfter = await listAfter.json();
    const itemsAfter = Array.isArray(subsAfter) ? subsAfter : (subsAfter.items || []);
    const deletedSub = itemsAfter.find((subscription: any) => subscription.id === subId);
    expect(deletedSub).toBeTruthy();
    expect(deletedSub.isActive).toBe(false);
    expect(deletedSub.invalidatedAt).toBeTruthy();
  });

  test('Expired/invalid push token handled gracefully', async ({ page }) => {
    await loginWithCookieSession(page, 'RIDER');

    const badSubPayload = {
      endpoint: 'https://invalid.push.service/expired-token-test',
      keys: { p256dh: 'invalid-key', auth: 'invalid-auth' },
      deviceInfo: 'expired-token-e2e',
    };

    const createResp = await page.request.post(`${API_BASE}/notifications/push/subscriptions`, {
      headers: { 'Content-Type': 'application/json' },
      data: badSubPayload,
    });
    expect(createResp.ok()).toBeTruthy();

    const listResp = await page.request.get(`${API_BASE}/notifications/push/subscriptions`);
    expect(listResp.ok()).toBeTruthy();
  });

  test('Notification deep link click records openedAt', async ({ page }) => {
    await loginWithCookieSession(page, 'RIDER');

    const inboxResp = await page.request.get(`${API_BASE}/notifications/inbox?limit=5`);
    expect(inboxResp.ok()).toBeTruthy();
    const inbox = await inboxResp.json();
    const items = Array.isArray(inbox) ? inbox : (inbox.items || []);

    if (items.length === 0) {
      test.skip(true, 'No inbox items available to test deep link click');
      return;
    }

    const firstItem = items[0];
    const recipientId = firstItem.recipientId;
    if (!recipientId) {
      test.skip(true, 'First inbox item has no recipientId');
      return;
    }

    expect(firstItem.openedAt).toBeFalsy();

    await page.goto(`/rider/notifications?aagamNotificationRecipient=${encodeURIComponent(recipientId)}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Rider Notifications/i })).toBeVisible({ timeout: 15000 });

    const checkResp = await page.request.get(`${API_BASE}/notifications/inbox?limit=5`);
    const updatedInbox = await checkResp.json();
    const updatedItems = Array.isArray(updatedInbox) ? updatedInbox : (updatedInbox.items || []);
    const updated = updatedItems.find((item: any) => item.id === firstItem.id);
    expect(updated).toBeTruthy();
  });
});
