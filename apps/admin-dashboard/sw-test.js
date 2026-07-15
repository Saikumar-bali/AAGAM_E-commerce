const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: 'http://localhost:3001',
    permissions: ['notifications'],
  });
  const page = await context.newPage();

  // Navigate to login and sign in
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', 'admin@aagam.com');
  await page.fill('input[type="password"]', 'admin@2026!');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => localStorage.getItem('access_token') !== null, { timeout: 15000 });
  console.log('Logged in');

  // Go to notifications page
  await page.goto('/admin/notifications');
  await page.waitForLoadState('networkidle');
  console.log('On notifications page');

  // Check SW URL served
  const swResp = await page.request.get('/firebase-messaging-sw.js');
  const swText = await swResp.text();
  const usesLocal = swText.includes("/firebase/firebase-app-compat.js");
  const configPopulated = swText.includes("AIzaSyAl1Pf38d75hTLnVRbzp2QRrwLpAdwcq0g");
  console.log('SW uses local paths:', usesLocal);
  console.log('SW config populated:', configPopulated);

  // Register SW directly
  await page.evaluate(async () => {
    // Unregister any existing
    const existing = await navigator.serviceWorker.getRegistrations();
    for (const reg of existing) await reg.unregister();

    // Register fresh
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // Health check
    const worker = registration.active || registration.waiting || registration.installing;
    const result = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data);
      channel.port1.onmessageerror = reject;
      worker.postMessage({ type: 'AAGAM_SW_HEALTH_CHECK' }, [channel.port2]);
      setTimeout(() => reject(new Error('Health check timeout')), 5000);
    });
    return result;
  }).then(result => {
    console.log('SW Health:', JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error('SW Error:', err.message);
  });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
