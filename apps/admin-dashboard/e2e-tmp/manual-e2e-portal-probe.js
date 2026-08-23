"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const BASE = 'https://aagaam.in';
async function main() {
    const browser = await playwright_1.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
    await page.fill('input[type="password"]', 'Aagam@2026#');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 60000 });
    const results = await page.evaluate(async () => {
        const out = {};
        for (const path of ['/api/riders/portal/home', '/api/riders/portal/offers', '/api/orders/dispatch/rider/workspace']) {
            try {
                const res = await fetch(path, { credentials: 'include' });
                out[path] = { status: res.status, body: (await res.text()).substring(0, 200) };
            }
            catch (e) {
                out[path] = { error: String(e) };
            }
        }
        return out;
    });
    for (const [k, v] of Object.entries(results))
        console.log(`[PROBE] ${k}\n`, JSON.stringify(v, null, 1));
    await browser.close();
    console.log('=== PORTAL PROBE COMPLETE ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
