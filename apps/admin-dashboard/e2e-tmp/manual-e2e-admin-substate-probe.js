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
        if (!res.ok)
            return { httpStatus: res.status, body: (await res.text().catch(() => '')).substring(0, 300) };
        return res.json();
    }, API + path);
    console.log('\n=== ADMIN DELIVERY CALENDAR (find cmsukav7 delivery) ===');
    const cal = await api('/admin/subscriptions/delivery-calendar');
    if (Array.isArray(cal)) {
        console.log('total calendar rows:', cal.length);
        const rows = cal.filter((d) => String(d.id || '').includes('cmsuk38qt') || /2026-08-1[56]/.test(String(d.serviceDate || '')));
        for (const d of rows.slice(0, 20)) {
            console.log(JSON.stringify({ id: d.id, sequenceNumber: d.sequenceNumber, status: d.status, serviceDate: d.serviceDate, cashDuePaise: d.cashDuePaise, deliveredAt: d.deliveredAt, subscription: d.subscription && { id: d.subscription.id, status: d.subscription.status, completedDeliveries: d.subscription.completedDeliveries, totalDeliveries: d.subscription.planVersion?.totalDeliveries, amountCollectedPaise: d.subscription.amountCollectedPaise, amountDuePaise: d.subscription.amountDuePaise, remainingFundedDeliveries: d.subscription.remainingFundedDeliveries }, order: d.order && { id: d.order.id, status: d.order.status } }, null, 2));
        }
        if (!rows.length)
            console.log('not found in first page; total rows:', cal.length);
    }
    else {
        console.log('CAL:', JSON.stringify(cal).substring(0, 1000));
    }
    console.log('\n=== ADMIN SUBSCRIPTIONS AGGREGATE ===');
    const agg = await api('/admin/subscriptions/aggregate');
    console.log(JSON.stringify(agg).substring(0, 1500));
    await browser.close();
    console.log('\n=== DONE ===');
}
run().catch((e) => { console.error(e); process.exit(1); });
