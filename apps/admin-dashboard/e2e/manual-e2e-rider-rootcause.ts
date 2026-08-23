import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();

  console.log('[LOGIN] Logging in as Admin...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
  await page.fill('input[type="password"]', 'Aagam@2026#');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(8000);
  console.log('[LOGIN] URL:', page.url());

  // 1. Riders page - check saikumarbali status
  console.log('\n[RIDERS] /admin/riders ...');
  await page.goto(`${BASE}/admin/riders`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  const ridersText = await page.evaluate(() => document.body.innerText);
  console.log('[RIDERS] Page text:\n', ridersText.substring(0, 4000));
  await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/rootcause-01-riders.png', fullPage: true });

  // 2. Dispatch page
  console.log('\n[DISPATCH] /admin/dispatch ...');
  await page.goto(`${BASE}/admin/dispatch`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  const dispatchText = await page.evaluate(() => document.body.innerText);
  console.log('[DISPATCH] Page text:\n', dispatchText.substring(0, 4000));
  await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/rootcause-02-dispatch.png', fullPage: true });

  // 3. Orders - look for any active orders
  console.log('\n[ORDERS] /admin/orders ...');
  await page.goto(`${BASE}/admin/orders`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  const ordersText = await page.evaluate(() => document.body.innerText);
  console.log('[ORDERS] Page text:\n', ordersText.substring(0, 5000));
  await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/rootcause-03-orders.png', fullPage: true });

  // 4. Live Tracking
  console.log('\n[LIVE TRACKING] /admin/live-tracking ...');
  await page.goto(`${BASE}/admin/live-tracking`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  const trackText = await page.evaluate(() => document.body.innerText);
  console.log('[LIVE TRACKING] Page text:\n', trackText.substring(0, 3000));
  await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/rootcause-04-tracking.png', fullPage: true });

  // 5. Delivery Exceptions
  console.log('\n[EXCEPTIONS] /admin/delivery-exceptions ...');
  await page.goto(`${BASE}/admin/delivery-exceptions`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  const excText = await page.evaluate(() => document.body.innerText);
  console.log('[EXCEPTIONS] Page text:\n', excText.substring(0, 3000));
  await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/rootcause-05-exceptions.png', fullPage: true });

  await browser.close();
  console.log('\n=== ALL CHECKS COMPLETE ===');
}

run().catch(e => { console.error(e); process.exit(1); });