import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';
const SHOT = 'e2e-tmp/shots-store-orders-fixed';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();

  console.log('[LOGIN] Store login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.fill('input[placeholder="Phone or email"]', 'balajichavitini@gmail.com');
  await page.fill('input[type="password"]', 'balaji@2026#');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(10000);
  console.log('[LOGIN] URL:', page.url());

  const payload = await page.evaluate(async () => {
    const res = await fetch('/api/orders/store', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const j = await res.json();
    return JSON.stringify(j.slice(0, 6).map((o: any) => ({
      id: o.id.slice(0, 10),
      status: o.status,
      subscriptionSequence: o.subscriptionSequence,
      subscription: o.subscription && { pricePaise: o.subscription.planVersion?.pricePaise },
      payment: o.payment && { method: o.payment.method, amountPaise: o.payment.amountPaise },
    })), null, 2);
  });
  console.log('\n=== PAYLOAD ===\n' + payload);

  console.log('\n[NAV] /store/orders...');
  await page.goto(`${BASE}/store/orders`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(8000);
  console.log('[NAV] URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText);
  const i = text.indexOf('4,900');
  console.log('[TEXT] contains "4,900":', i >= 0);
  const j = text.indexOf('84,900');
  console.log('[TEXT] contains "84,900":', j >= 0);
  const k = text.indexOf('₹849');
  console.log('[TEXT] contains "₹849":', k >= 0);
  const m = text.indexOf('₹49');
  console.log('[TEXT] contains "₹49":', m >= 0);
  const n = text.indexOf('₹28.3');
  console.log('[TEXT] contains "₹28.3" (should be gone for subscription card):', n >= 0);
  await page.screenshot({ path: `${SHOT}.png`, fullPage: true });
  console.log('screenshot saved');
  await browser.close();
  console.log('\n=== DONE ===');
}

run().catch((e) => { console.error(e); process.exit(1); });