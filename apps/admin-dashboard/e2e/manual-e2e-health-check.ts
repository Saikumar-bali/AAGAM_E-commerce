import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';
const API = 'https://aagaam.in/api';

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
  console.log('[LOGIN] URL:', page.url());

  const api = async (path: string) =>
    page.evaluate(async (p) => {
      const res = await fetch(p, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const text = await res.text();
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { json = text.substring(0, 300); }
      return { httpStatus: res.status, body: json };
    }, API + path);

  console.log('\n=== RIDERS ===');
  const riders = await api('/riders');
  if (Array.isArray(riders.body)) {
    for (const r of riders.body) {
      console.log(JSON.stringify({ name: r.user?.name, status: r.status, updatedAt: r.updatedAt }));
    }
  }

  console.log('\n=== DISPATCH BOARD ===');
  const board = await api('/orders/dispatch/board');
  const b = board.body as any;
  if (b && Array.isArray(b.riders)) {
    for (const r of b.riders) {
      console.log(JSON.stringify({ name: r.user?.name, status: r.status, activeJobCount: r.activeJobCount, available: r.available }));
    }
    console.log('openOffers:', (b.openOffers || []).map((o: any) => ({ job: o.deliveryJobId, status: o.status })));
    console.log('waitingJobs:', (b.waitingJobs || []).map((w: any) => ({ id: w.id, status: w.status })));
    console.log('activeJobs:', (b.activeJobs || []).map((a: any) => ({ id: a.id, status: a.status, currentRiderId: a.currentRiderId, orderId: a.orderId })));
  }

  console.log('\n=== SUBSCRIPTION DELIVERY (reconciled row) ===');
  const cal = await api('/admin/subscriptions/delivery-calendar');
  if (Array.isArray(cal.body)) {
    const row = (cal.body as any[]).find((d: any) => d.id === 'cmsuk38qt02nrd84tpaahef67');
    console.log(JSON.stringify(row && {
      id: row.id, status: row.status, deliveredAt: row.deliveredAt,
      subscription: row.subscription && { status: row.subscription.status, completedDeliveries: row.subscription.completedDeliveries, amountCollectedPaise: row.subscription.amountCollectedPaise, amountDuePaise: row.subscription.amountDuePaise },
    }, null, 2));
    const stuck = (cal.body as any[]).filter((d: any) => d.status === 'ORDER_GENERATED' && d.order?.status === 'DELIVERED');
    console.log('STUCK rows needing reconcile:', stuck.length, stuck.map((s: any) => s.id));
  }

  await browser.close();
  console.log('\n=== DONE ===');
}

run().catch((e) => { console.error(e); process.exit(1); });