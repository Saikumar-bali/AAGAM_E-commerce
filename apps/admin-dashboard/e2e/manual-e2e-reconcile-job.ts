import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';
const API = 'https://aagaam.in/api';
const JOB_ID = 'cmsvtf3fe0q4ivd3p7r6q87si';

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

  console.log('\n=== RECONCILE STUCK JOB ===');
  const res = await api(`/orders/delivery-operations/jobs/${JOB_ID}/admin-reconcile-order`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `admin-reconcile-job:${JOB_ID}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Order already DELIVERED; reconcile stuck delivery job to release rider' }),
  });
  console.log('httpStatus:', res.httpStatus);
  console.log(JSON.stringify(res.body, null, 2).substring(0, 1200));

  console.log('\n=== JOB + RIDER AFTER ===');
  const job = await api(`/orders/delivery-operations/jobs/${JOB_ID}/summary`);
  const jb = job.body as any;
  console.log(JSON.stringify({
    job: jb?.job && { id: jb.job.id, status: jb.job.status, currentRiderId: jb.job.currentRiderId, version: jb.job.version },
    deliveryProof: jb?.job?.deliveryProof && { method: jb.job.deliveryProof.method, note: jb.job.deliveryProof.note },
  }, null, 2));
  const riders = await api('/riders');
  if (Array.isArray(riders.body)) {
    for (const r of riders.body) {
      console.log(JSON.stringify({ name: r.user?.name, status: r.status }));
    }
  }
  const board = await api('/orders/dispatch/board');
  const b = board.body as any;
  if (b && Array.isArray(b.riders)) {
    console.log('board riders:', JSON.stringify(b.riders.map((r: any) => ({ name: r.user?.name, status: r.status, activeJobCount: r.activeJobCount }))));
    console.log('waitingJobs:', (b.waitingJobs || []).map((w: any) => ({ id: w.id.slice(0, 8).toUpperCase(), status: w.status })));
  }

  await browser.close();
  console.log('\n=== DONE ===');
}

run().catch((e) => { console.error(e); process.exit(1); });