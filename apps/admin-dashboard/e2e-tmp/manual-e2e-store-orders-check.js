"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const BASE = 'https://aagaam.in';
const API = 'https://aagaam.in/api';
async function run() {
    const browser = await playwright_1.chromium.launch({ headless: true });
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
    const out = await page.evaluate(async () => {
        const res = await fetch('/api/orders/store', { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const j = await res.json();
        return JSON.stringify(j.slice(0, 8).map((o) => ({
            id: o.id,
            status: o.status,
            grandTotal: o.grandTotal,
            subscriptionId: o.subscriptionId,
            subscriptionSequence: o.subscriptionSequence,
            payment: o.payment && { method: o.payment.method, status: o.payment.status, amountPaise: o.payment.amountPaise },
        })), null, 2);
    });
    console.log(out);
    await browser.close();
    console.log('\n=== DONE ===');
}
run().catch((e) => { console.error(e); process.exit(1); });
