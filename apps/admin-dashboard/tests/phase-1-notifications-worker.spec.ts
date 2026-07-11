import { expect, Page, test } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

const PASSWORDS: Record<string, string> = {
  'admin@aagam.com': 'admin@2026!',
  'customer@aagam.com': 'customer@2026!',
  'store@aagam.com': 'store@2026!',
  'store2@aagam.com': 'store@2026!',
  'rider@aagam.com': 'rider@2026!',
  'rider1@aagam.com': 'rider@2026!',
  'rider2@aagam.com': 'rider@2026!',
};

async function login(page: Page, email: string, password = PASSWORDS[email] || 'Test@1234') {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('access_token') !== null, { timeout: 15000 });
}

test.describe('Phase 1.1: web push service worker stability', () => {
  test('worker endpoint serves JavaScript and installs in health-only mode', async ({ page }) => {
    const response = await page.request.get('/firebase-messaging-sw.js?health=1');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/javascript');

    const source = await response.text();
    expect(source).toContain('AAGAM_SW_VERSION');
    expect(source).toContain('AAGAM_SW_HEALTH_CHECK');
    expect(source).not.toContain('<!DOCTYPE html>');

    await page.goto('/login');
    const result = await page.evaluate(async () => {
      const existing = await navigator.serviceWorker.getRegistrations();
      await Promise.all(existing.map((registration) => registration.unregister()));

      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js?health=1',
        { scope: '/', updateViaCache: 'none' },
      );
      await navigator.serviceWorker.ready;

      const worker = registration.active || registration.waiting || registration.installing;
      if (!worker) throw new Error('Worker instance missing after registration');

      const health = await new Promise<any>((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = window.setTimeout(
          () => reject(new Error('Worker health response timed out')),
          8000,
        );
        channel.port1.onmessage = (event) => {
          window.clearTimeout(timeout);
          resolve(event.data);
        };
        worker.postMessage({ type: 'AAGAM_SW_HEALTH_CHECK' }, [channel.port2]);
      });

      await registration.unregister();
      return {
        active: Boolean(registration.active),
        health,
      };
    });

    expect(result.active).toBe(true);
    expect(result.health.status).toBe('CONFIG_MISSING');
    expect(result.health.firebaseConfigReady).toBe(false);
    expect(result.health.version).toBe('phase-1.1-web-push-1');
  });

  test('push config endpoint never reports enabled with missing required fields', async ({ page }) => {
    await login(page, 'admin@aagam.com');
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    const response = await page.request.get(`${API_BASE}/notifications/push/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok()).toBeTruthy();
    const config = await response.json();

    if (config.enabled) {
      expect(config.vapidKey).toBeTruthy();
      expect(config.firebaseConfig?.apiKey).toBeTruthy();
      expect(config.firebaseConfig?.projectId).toBeTruthy();
      expect(config.firebaseConfig?.messagingSenderId).toBeTruthy();
      expect(config.firebaseConfig?.appId).toBeTruthy();
      expect(config.missing).toEqual([]);
    } else {
      expect(config.vapidKey).toBeNull();
      expect(config.firebaseConfig).toBeNull();
      expect(Array.isArray(config.missing)).toBe(true);
      expect(config.missing.length).toBeGreaterThan(0);
    }
  });
});
