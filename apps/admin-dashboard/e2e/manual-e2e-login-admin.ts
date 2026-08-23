import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // ── STEP 1: Admin Login ──
  console.log('[1] Navigating to login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
  await page.fill('input[type="password"]', 'Aagam@2026#');
  await page.screenshot({ path: '../docs/qa/e2e-02-login-filled.png' });
  
  await page.click('button[type="submit"]');
  console.log('[1] Submitted login, waiting for redirect...');
  await page.waitForTimeout(8000);
  console.log('[1] Current URL after login:', page.url());
  await page.screenshot({ path: '../docs/qa/e2e-03-after-login.png' });

  // ── STEP 2: Admin Subscriptions ──
  console.log('\n[2] Navigating to /admin/subscriptions...');
  await page.goto(`${BASE}/admin/subscriptions`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('[2] URL:', page.url());
  await page.screenshot({ path: '../docs/qa/e2e-04-admin-subscriptions.png', fullPage: true });
  
  const subText = await page.evaluate(() => document.body.innerText);
  console.log('[2] Subscriptions page text (first 4000 chars):\n', subText.substring(0, 4000));

  // ── STEP 3: Check Tomorrow Operations tab ──
  console.log('\n[3] Looking for Tomorrow operations tab...');
  const tomorrowBtn = page.locator('text=Tomorrow').first();
  if (await tomorrowBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await tomorrowBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '../docs/qa/e2e-05-tomorrow-ops.png', fullPage: true });
    const tomorrowText = await page.evaluate(() => document.body.innerText);
    console.log('[3] Tomorrow ops text (first 4000 chars):\n', tomorrowText.substring(0, 4000));
  } else {
    console.log('[3] No Tomorrow tab found. Looking for tabs...');
    const tabs = await page.$$eval('[role="tab"], button, a', els => els.map(e => (e as HTMLElement).innerText.trim()).filter(t => t.length > 0 && t.length < 50));
    console.log('[3] Available tabs/buttons:', tabs.slice(0, 20));
  }

  // ── STEP 4: Store subscriptions ──
  console.log('\n[4] Navigating to /store/subscriptions...');
  await page.goto(`${BASE}/store/subscriptions`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('[4] URL:', page.url());
  await page.screenshot({ path: '../docs/qa/e2e-06-store-subscriptions.png', fullPage: true });
  
  const storeText = await page.evaluate(() => document.body.innerText);
  console.log('[4] Store subscriptions text (first 4000 chars):\n', storeText.substring(0, 4000));

  // ── STEP 5: Route Planning ──
  console.log('\n[5] Navigating to /admin/route-planning...');
  await page.goto(`${BASE}/admin/route-planning`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('[5] URL:', page.url());
  await page.screenshot({ path: '../docs/qa/e2e-07-route-planning.png', fullPage: true });
  
  const routeText = await page.evaluate(() => document.body.innerText);
  console.log('[5] Route planning text (first 4000 chars):\n', routeText.substring(0, 4000));

  await browser.close();
  console.log('\n✓ Admin dashboard checks complete.');
}

run().catch(e => { console.error(e); process.exit(1); });
