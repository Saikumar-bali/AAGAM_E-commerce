import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // ── Store Owner Login ──
  console.log('[1] Logging in as Store Owner...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  await page.fill('input[placeholder="Phone or email"]', 'balajichavitini@gmail.com');
  await page.fill('input[type="password"]', 'balaji@2026#');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(8000);
  console.log('[1] URL after login:', page.url());
  await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/e2e-store-01-dashboard.png' });

  // ── Store Subscriptions ──
  console.log('\n[2] Navigating to /store/subscriptions...');
  await page.goto(`${BASE}/store/subscriptions`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('[2] URL:', page.url());
  await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/e2e-store-02-subscriptions.png', fullPage: true });
  
  const storeSubText = await page.evaluate(() => document.body.innerText);
  console.log('[2] Store subscriptions text (first 5000 chars):\n', storeSubText.substring(0, 5000));

  // ── Look for Tomorrow Prep tab ──
  console.log('\n[3] Looking for Tomorrow prep...');
  const tabs = await page.$$eval('button, a, [role="tab"]', els => 
    els.map(e => ({ text: (e as HTMLElement).innerText.trim(), tag: e.tagName }))
      .filter(t => t.text.length > 0 && t.text.length < 60)
  );
  console.log('[3] Available tabs/buttons:', JSON.stringify(tabs.slice(0, 30), null, 2));

  // Try clicking Tomorrow prep
  const tomorrowPrep = page.locator('text=Tomorrow prep').first();
  if (await tomorrowPrep.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('[3] Found Tomorrow prep tab, clicking...');
    await tomorrowPrep.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'D:/AAGAM_E-commerce/docs/qa/e2e-store-03-tomorrow-prep.png', fullPage: true });
    const prepText = await page.evaluate(() => document.body.innerText);
    console.log('[3] Tomorrow prep text (first 5000 chars):\n', prepText.substring(0, 5000));
  }

  await browser.close();
  console.log('\n✓ Store owner checks complete.');
}

run().catch(e => { console.error(e); process.exit(1); });
