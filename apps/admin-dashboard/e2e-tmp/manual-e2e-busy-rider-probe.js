"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const BASE = 'https://aagaam.in';
const API = 'https://aagaam.in/api';
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
    console.log('\n=== DISPATCH BOARD ===');
    const board = await api('/orders/dispatch/board');
    const b = board.body;
    if (b && Array.isArray(b.riders)) {
        for (const r of b.riders) {
            console.log(JSON.stringify({
                name: r.user?.name, status: r.status,
                activeJobCount: r.activeJobCount, activeStoreId: r.activeStoreId,
                acceptingSameStoreOrders: r.acceptingSameStoreOrders, available: r.available,
                currentJobId: r.currentJobId, currentRunId: r.currentRunId,
            }));
        }
        console.log('openOffers:', (b.openOffers || []).map((o) => ({ job: o.deliveryJobId, rider: o.riderProfile?.userId, status: o.status, createdAt: o.createdAt, expiresAt: o.expiresAt })));
        console.log('waitingJobs:', (b.waitingJobs || []).map((w) => ({ id: w.id, status: w.status, currentRiderId: w.currentRiderId, orderId: w.orderId })));
        console.log('activeJobs:', (b.activeJobs || []).map((a) => ({ id: a.id, status: a.status, currentRiderId: a.currentRiderId, orderId: a.orderId })));
    }
    else {
        console.log('BOARD:', JSON.stringify(b).substring(0, 1200));
    }
    console.log('\n=== RIDERS LIST ===');
    const riders = await api('/riders');
    if (Array.isArray(riders.body)) {
        for (const r of riders.body) {
            console.log(JSON.stringify({
                id: r.id, name: r.user?.name, status: r.status, operationalStatus: r.operationalStatus,
                currentDeliveryJobId: r.currentDeliveryJobId, currentRunId: r.currentRunId,
                maximumParcelCapacity: r.maximumParcelCapacity, updatedAt: r.updatedAt,
            }));
        }
    }
    else {
        console.log('RIDERS:', JSON.stringify(riders).substring(0, 800));
    }
    console.log('\n=== STORE ORDERS (recent, find cancelled) ===');
    const orders = await api('/orders/store');
    if (Array.isArray(orders.body)) {
        const recent = orders.body.slice(0, 12);
        for (const o of recent) {
            console.log(JSON.stringify({
                id: o.id, status: o.status, grandTotal: o.grandTotal,
                createdAt: o.createdAt, subscriptionId: o.subscriptionId,
                payment: o.payment && { method: o.payment.method, status: o.payment.status },
            }));
        }
    }
    else {
        console.log('ORDERS:', JSON.stringify(orders).substring(0, 800));
    }
    await browser.close();
    console.log('\n=== DONE ===');
}
run().catch((e) => { console.error(e); process.exit(1); });
