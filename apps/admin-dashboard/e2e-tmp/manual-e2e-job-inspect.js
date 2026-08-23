"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const BASE = 'https://aagaam.in';
const API = 'https://aagaam.in/api';
const ORDER_ID = 'cmsufo83w00vg3xfc4ty4a9se';
const JOB_ID = 'cmsvtf3fe0q4ivd3p7r6q87si';
const RIDER_ID = 'ff7e0aba-3fe9-46da-a566-648415f0f2ce';
async function run() {
    const browser = await playwright_1.chromium.launch({ headless: true });
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
    const api = async (path) => page.evaluate(async (p) => {
        const res = await fetch(p, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const text = await res.text();
        let json = null;
        try {
            json = JSON.parse(text);
        }
        catch {
            json = text.substring(0, 300);
        }
        return { httpStatus: res.status, body: json };
    }, API + path);
    console.log('\n=== ORDER (with history via raw query) ===');
    const orderRaw = await page.evaluate(async ({ API, ORDER_ID }) => {
        const res = await fetch(`${API}/orders/${ORDER_ID}`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        return res.json();
    }, { API, ORDER_ID });
    const o = orderRaw;
    console.log(JSON.stringify(o && {
        id: o.id, status: o.status, createdAt: o.createdAt, cancelledAt: o.cancelledAt,
        subscriptionId: o.subscriptionId, deliveredAt: o.deliveredAt, riderId: o.riderId,
        payment: o.payment && { method: o.payment.method, status: o.payment.status },
    }, null, 2));
    const histRes = await page.evaluate(async ({ API, ORDER_ID }) => {
        const res = await fetch(`${API}/orders/${ORDER_ID}/status-history`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const text = await res.text();
        let json = null;
        try {
            json = JSON.parse(text);
        }
        catch {
            json = text.substring(0, 300);
        }
        return { httpStatus: res.status, body: json };
    }, { API, ORDER_ID });
    console.log('\n=== STATUS HISTORY ===');
    console.log(JSON.stringify(histRes.body, null, 2).substring(0, 2500));
    console.log('\n=== JOB SUMMARY ===');
    const job = await api(`/orders/delivery-operations/jobs/${JOB_ID}/summary`);
    const jb = job.body;
    const brief = {
        job: jb?.job && { id: jb.job.id, status: jb.job.status, currentRiderId: jb.job.currentRiderId, version: jb.job.version, createdAt: jb.job.createdAt, updatedAt: jb.job.updatedAt },
        order: jb?.job?.order && { id: jb.job.order.id, status: jb.job.order.status, payment: jb.job.order.payment && { method: jb.job.order.payment.method, status: jb.job.order.payment.status, amountPaise: jb.job.order.payment.amountPaise }, codLedger: jb.job.order.codLedger && { status: jb.job.order.codLedger.status, collectedAmountPaise: jb.job.order.codLedger.collectedAmountPaise, depositedAmountPaise: jb.job.order.codLedger.depositedAmountPaise, riderHoldingBalancePaise: jb.job.order.codLedger.riderHoldingBalancePaise } },
        pickupProof: jb?.job?.pickupProof && { method: jb.job.pickupProof.method, status: jb.job.pickupProof.status, verifiedAt: jb.job.pickupProof.verifiedAt },
        deliveryProof: jb?.job?.deliveryProof && { method: jb.job.deliveryProof.method, status: jb.job.deliveryProof.status, verifiedAt: jb.job.deliveryProof.verifiedAt, deliveredAt: jb.job.deliveryProof.deliveredAt },
        operations: (jb?.operations || []).slice(0, 12).map((op) => ({ type: op.type, status: op.status, createdAt: op.createdAt })),
    };
    console.log(JSON.stringify(brief, null, 2));
    console.log('\n=== RIDER DETAIL ===');
    const rider = await api(`/riders/${RIDER_ID}`);
    console.log(JSON.stringify(rider.body, null, 2).substring(0, 1500));
    await browser.close();
    console.log('\n=== DONE ===');
}
run().catch((e) => { console.error(e); process.exit(1); });
