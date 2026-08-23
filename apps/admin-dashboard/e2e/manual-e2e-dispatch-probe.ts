import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';
const SHOT = 'e2e-tmp/shots-dispatch-probe';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('response', async (res) => {
    if (res.url().includes('/orders/dispatch/board')) {
      try {
        const j = await res.json();
        console.log('[BOARD] riders:', JSON.stringify(j.riders?.map((r: any) => ({
          name: r.user?.name, status: r.status,
          activeJobCount: r.activeJobCount, activeStoreId: r.activeStoreId,
          acceptingSameStoreOrders: r.acceptingSameStoreOrders, available: r.available,
        }))));
        console.log('[BOARD] openOffers:', (j.openOffers || []).map((o: any) => ({
          job: o.deliveryJobId?.slice(0, 8).toUpperCase(),
          rider: o.riderProfile?.userId?.slice(0, 8),
          status: o.status,
        })));
        console.log('[BOARD] waitingJobs:', (j.waitingJobs || []).map((w: any) => ({
          id: w.id?.slice(0, 8).toUpperCase(), status: w.status,
          rider: w.currentRiderId ? 'SET' : null,
        })));
      } catch { /* ignore */ }
    }
  });

  console.log('[LOGIN] Admin login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
  await page.fill('input[type="password"]', 'Aagam@2026#');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 60000 });

  console.log('[DISPATCH] Fetching board...');
  await page.goto(`${BASE}/admin/dispatch`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const j: any = await page.evaluate(async () => {
    const res = await fetch('/api/orders/dispatch/board', { credentials: 'include' });
    return res.json();
  });
  console.log('[BOARD] riders:', JSON.stringify(j.riders?.map((r: any) => ({
    name: r.user?.name, status: r.status,
    activeJobCount: r.activeJobCount, activeStoreId: r.activeStoreId,
    acceptingSameStoreOrders: r.acceptingSameStoreOrders, available: r.available,
  }))));
  console.log('[BOARD] openOffers:', JSON.stringify((j.openOffers || []).map((o: any) => ({
    job: o.deliveryJobId?.slice(0, 8).toUpperCase(),
    rider: o.riderProfile?.userId?.slice(0, 8),
    status: o.status,
    createdAt: o.createdAt,
    offeredAt: o.offeredAt,
    expiresAt: o.expiresAt,
    respondedAt: o.respondedAt,
  })), null, 1));
  console.log('[BOARD] waitingJobs:', (j.waitingJobs || []).map((w: any) => ({
    id: w.id?.slice(0, 8).toUpperCase(), status: w.status,
    rider: w.currentRiderId ? 'SET' : null,
  })));
  console.log('[BOARD] activeJobs:', (j.activeJobs || []).map((a: any) => ({
    id: a.id?.slice(0, 8).toUpperCase(), status: a.status,
    rider: a.currentRiderId ? 'SET' : null,
  })));

  const txt = await page.evaluate(() => document.body.innerText);
  const i = txt.indexOf('AVAILABLE RIDERS');
  console.log('[DISPATCH] Stats around AVAILABLE RIDERS:\n', txt.substring(Math.max(0, i - 500), i + 400));
  const k = txt.indexOf('AUTO OFFERS');
  if (j >= 0) console.log('[DISPATCH] Offers section:\n', txt.substring(j, j + 400));
  await page.screenshot({ path: `${SHOT}-board.png`, fullPage: true });
  await browser.close();
  console.log('=== DISPATCH PROBE COMPLETE ===');
}

main().catch((e) => { console.error(e); process.exit(1); });