import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
  await page.fill('input[type="password"]', 'Aagam@2026#');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 60000 });

  const snap = async (label: string) => {
    const riders: any = await page.evaluate(async () => {
      const res = await fetch('/api/riders', { credentials: 'include' });
      return res.json();
    });
    const rows = Array.isArray(riders) ? riders : riders?.items || riders?.riders || [];
    const me = rows.find((r: any) => r?.user?.phone === '+919874561230' || r?.user?.name === 'saikumarbali');
    if (me) console.log(`[HEARTBEAT ${label}] status=${me.status} updatedAt=${me.updatedAt} lat=${me.latitude} lng=${me.longitude}`);
    else console.log(`[HEARTBEAT ${label}] rider not found in ${rows.length} rows`);
  };

  await snap('T0');
  await page.waitForTimeout(20000);
  await snap('T1');
  await page.waitForTimeout(20000);
  await snap('T2');
  await browser.close();
  console.log('=== HEARTBEAT PROBE COMPLETE ===');
}

main().catch((e) => { console.error(e); process.exit(1); });