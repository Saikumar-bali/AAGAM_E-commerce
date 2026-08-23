"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const BASE = 'https://aagaam.in';
const SHOT = 'D:/AAGAM_E-commerce/docs/qa';
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
    await page.waitForTimeout(8000);
    console.log('[LOGIN] URL:', page.url());
    const pageText = async (name, url, slice = 4500) => {
        await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(6000);
        const text = await page.evaluate(() => document.body.innerText);
        console.log(`\n[${name}] ${url}`);
        console.log(text.substring(0, slice));
        await page.screenshot({ path: `${SHOT}/complete-${name}.png`, fullPage: true });
    };
    await pageText('riders', '/admin/riders');
    await pageText('dispatch', '/admin/dispatch');
    await pageText('exceptions', '/admin/delivery-exceptions');
    await pageText('route-planning', '/admin/route-planning');
    await pageText('orders', '/admin/orders');
    await pageText('live-tracking', '/admin/live-tracking');
    await pageText('subscriptions', '/admin/subscriptions');
    await browser.close();
    console.log('\n=== STATE PROBE COMPLETE ===');
}
run().catch((e) => { console.error(e); process.exit(1); });
