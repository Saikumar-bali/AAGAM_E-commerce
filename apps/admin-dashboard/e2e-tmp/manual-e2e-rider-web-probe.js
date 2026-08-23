"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const BASE = 'https://aagaam.in';
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('response', async (res) => {
        const url = res.url();
        if (url.includes('/riders/portal') || url.includes('/dispatch/rider')) {
            let body = '';
            try {
                body = (await res.text()).substring(0, 500);
            }
            catch {
                body = '(no body)';
            }
            console.log(`[API ${res.status()}] ${url.replace(BASE, '')}\n${body}`);
        }
    });
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.fill('input[placeholder="Phone or email"]', 'rider@aagam.com');
    await page.fill('input[type="password"]', 'rider@2026!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(8000);
    console.log('[LOGIN] URL now:', page.url());
    const t = await page.evaluate(() => document.body.innerText);
    console.log('[PAGE] body (first 800):', t.substring(0, 800));
    await browser.close();
    console.log('=== RIDER WEB PROBE COMPLETE ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
