import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';
const API = 'https://aagaam.in/api';
const DELIVERY_ID = 'cmsuk38qt02nrd84tpaahef67';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();

  console.log('[LOGIN] Admin login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
  await page.fill('input[type="password"]', 'Aagam@2026#');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(10000);
  console.log('[LOGIN] URL:', page.url());

  const api = async (path: string, init?: RequestInit) =>
    page.evaluate(async ({ p, i }) => {
      const res = await fetch(p, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest', ...(i?.headers || {}) },
        method: i?.method || 'GET',
        body: i?.body,
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { json = text.substring(0, 300); }
      return { httpStatus: res.status, body: json };
    }, { p: API + path, i: init });

  console.log('\n=== BEFORE: delivery state ===');
  const before = await api(`/admin/subscriptions/delivery-calendar`);
  if (Array.isArray(before.body)) {
    const row = (before.body as any[]).find((d: any) => d.id === DELIVERY_ID);
    console.log(JSON.stringify(row && {
      id: row.id, status: row.status, sequenceNumber: row.sequenceNumber,
      cashDuePaise: row.cashDuePaise, deliveredAt: row.deliveredAt,
      subscription: row.subscription && { id: row.subscription.id, status: row.subscription.status, completedDeliveries: row.subscription.completedDeliveries, totalDeliveries: row.subscription.planVersion?.totalDeliveries, amountCollectedPaise: row.subscription.amountCollectedPaise, amountDuePaise: row.subscription.amountDuePaise, remainingFundedDeliveries: row.subscription.remainingFundedDeliveries },
      order: row.order && { id: row.order.id, status: row.order.status },
    }, null, 2));
  } else {
    console.log(JSON.stringify(before).substring(0, 500));
  }

  console.log('\n=== RECONCILE POST ===');
  const rec = await api(`/admin/subscriptions/deliveries/${DELIVERY_ID}/reconcile`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `admin-reconcile:${DELIVERY_ID}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  console.log('httpStatus:', rec.httpStatus);
  console.log(JSON.stringify(rec.body).substring(0, 1200));

  console.log('\n=== AFTER: delivery state ===');
  const after = await api(`/admin/subscriptions/delivery-calendar`);
  if (Array.isArray(after.body)) {
    const row = (after.body as any[]).find((d: any) => d.id === DELIVERY_ID);
    console.log(JSON.stringify(row && {
      id: row.id, status: row.status, sequenceNumber: row.sequenceNumber,
      cashDuePaise: row.cashDuePaise, deliveredAt: row.deliveredAt,
      subscription: row.subscription && { id: row.subscription.id, status: row.subscription.status, completedDeliveries: row.subscription.completedDeliveries, totalDeliveries: row.subscription.planVersion?.totalDeliveries, amountCollectedPaise: row.subscription.amountCollectedPaise, amountDuePaise: row.subscription.amountDuePaise, remainingFundedDeliveries: row.subscription.remainingFundedDeliveries },
      order: row.order && { id: row.order.id, status: row.order.status },
    }, null, 2));
  } else {
    console.log(JSON.stringify(after).substring(0, 500));
  }

  await browser.close();
  console.log('\n=== DONE ===');
}

run().catch((e) => { console.error(e); process.exit(1); });