import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';
const API = 'https://aagaam.in/api';

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

  const api = async (path: string) =>
    page.evaluate(async (p) => {
      const res = await fetch(p, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!res.ok) return { httpStatus: res.status, body: (await res.text().catch(() => '')).substring(0, 400) };
      return res.json();
    }, API + path);

  console.log('\n=== RUNS (raw) ===');
  const runs = await api('/store/subscription-operations/runs');
  if (Array.isArray(runs)) {
    for (const run of runs) {
      console.log(`RUN ${run.routeCode} id=${run.id} status=${run.status} expectedCash=${run.expectedCashPaise} rider=${run.rider?.user?.name || 'none'} riderId=${run.rider?.id || 'none'}`);
      for (const stop of run.stops || []) {
        console.log(JSON.stringify({ seq: stop.sequenceNumber, stopId: stop.id, status: stop.status, cashDue: stop.cashDuePaise, version: stop.version, jobId: stop.deliveryJobId, subDel: stop.subscriptionDelivery?.id, order: stop.subscriptionDelivery?.order?.id }, null, 2));
      }
    }
  } else {
    console.log('RUNS:', JSON.stringify(runs).substring(0, 2000));
  }

  console.log('\n=== STORE ORDERS cmsukav* (raw) ===');
  const orders = await api('/orders/store');
  if (Array.isArray(orders)) {
    for (const o of orders) {
      if (/cmsukav/i.test(o.id || '')) {
        console.log(JSON.stringify({ id: o.id, status: o.status, payment: o.payment, subscriptionId: o.subscriptionId, subscriptionDeliveryId: o.subscriptionDeliveryId, subscriptionSequence: o.subscriptionSequence, deliveryJob: o.deliveryJob && { id: o.deliveryJob.id, status: o.deliveryJob.status, currentRiderId: o.deliveryJob.currentRiderId }, codLedger: o.codLedger, items: o.items }, null, 2).substring(0, 5000));
      }
    }
  } else {
    console.log('ORDERS:', JSON.stringify(orders).substring(0, 1500));
  }

  await browser.close();
  console.log('\n=== DONE ===');
}

run().catch((e) => { console.error(e); process.exit(1); });
