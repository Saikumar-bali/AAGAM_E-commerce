import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
  await page.fill('input[type="password"]', 'Aagam@2026#');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(10000);

  const out = await page.evaluate(async () => {
    const res = await fetch('/api/orders/cmsufo83w00vg3xfc4ty4a9se/tracking', { credentials: 'include' });
    const j = await res.json();
    return JSON.stringify({
      status: j.status,
      deliveredAt: j.deliveredAt,
      cancelledAt: j.cancelledAt,
      timeline: (j.timeline || []).map((h: any) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt, actor: h.actorRole, note: h.note })),
    }, null, 2);
  });
  console.log(out);
  await browser.close();
  console.log('=== DONE ===');
}

run().catch((e) => { console.error(e); process.exit(1); });