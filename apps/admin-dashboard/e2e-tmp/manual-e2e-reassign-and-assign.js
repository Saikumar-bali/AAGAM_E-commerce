"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const BASE = 'https://aagaam.in';
const SHOT = 'D:/AAGAM_E-commerce/docs/qa';
async function run() {
    const browser = await playwright_1.chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    const page = await ctx.newPage();
    page.on('dialog', (dialog) => void dialog.accept());
    page.on('response', async (res) => {
        if (res.url().includes('/orders/delivery-operations')) {
            let body = '';
            try {
                body = await res.text();
            }
            catch {
                body = '(no body)';
            }
            console.log(`[API ${res.status()}] ${res.url()}\n${body.substring(0, 600)}`);
        }
        if (res.url().includes('/orders/dispatch/board')) {
            try {
                const j = await res.json();
                console.log('[BOARD] riders:', JSON.stringify(j.riders?.map((r) => ({ name: r.user?.name, status: r.status, activeJobCount: r.activeJobCount, activeStoreId: r.activeStoreId, acceptingSameStoreOrders: r.acceptingSameStoreOrders, available: r.available }))));
                console.log('[BOARD] waitingJobs:', (j.waitingJobs || []).map((w) => ({ id: w.id?.slice(0, 8).toUpperCase(), status: w.status, rider: w.currentRiderId?.slice(0, 8) })));
                console.log('[BOARD] openOffers:', (j.openOffers || []).length);
            }
            catch { /* non-json */ }
        }
    });
    console.log('[LOGIN] Admin login...');
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(4000);
    await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
    await page.fill('input[type="password"]', 'Aagam@2026#');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(8000);
    console.log('[LOGIN] URL:', page.url());
    // 1) Exceptions: apply REASSIGN_RIDER on #KBMEQZ7X
    console.log('\n[EXCEPTIONS] Applying REASSIGN on #KBMEQZ7X...');
    await page.goto(`${BASE}/admin/delivery-exceptions`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(6000);
    const applyBtn = page.getByRole('button', { name: 'Apply decision' }).first();
    await applyBtn.waitFor({ state: 'visible', timeout: 30000 });
    const card = page.locator('section, div').filter({ has: applyBtn }).last();
    const actionSelect = card.locator('select').first();
    await actionSelect.selectOption({ label: 'CANCEL AND REFUND' });
    await card
        .locator('input[placeholder="Required only when overriding the system recommendation"]')
        .fill('Failed delivery was force-completed earlier; cancel job to release rider');
    await applyBtn.click();
    await page.waitForTimeout(6000);
    const excText = await page.evaluate(() => document.body.innerText);
    const kb = excText.indexOf('#KBMEQZ7X');
    console.log('[EXCEPTIONS] After apply (around KBMEQZ7X):\n', excText.substring(kb - 400, kb + 900));
    const msgIdx = excText.indexOf('Failure resolution applied');
    const errIdx = excText.indexOf('could not be completed');
    if (msgIdx >= 0)
        console.log('[EXCEPTIONS] Success toast:', excText.substring(msgIdx, msgIdx + 120));
    if (errIdx >= 0)
        console.log('[EXCEPTIONS] Error toast:', excText.substring(Math.max(0, errIdx - 160), errIdx + 120));
    await page.screenshot({ path: `${SHOT}/flow-01-exception-reassign.png`, fullPage: true });
    // 2) Dispatch: verify rider now available and assign #CMSUKAV7 to saikumarbali
    console.log('\n[DISPATCH] Assigning #CMSUKAV7 to saikumarbali...');
    await page.goto(`${BASE}/admin/dispatch`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(7000);
    const dispText0 = await page.evaluate(() => document.body.innerText);
    const availIdx = dispText0.indexOf('AVAILABLE RIDERS');
    console.log('[DISPATCH] Board stats:\n', dispText0.substring(availIdx, availIdx + 60));
    const jobCard = page.locator('section, div').filter({ has: page.getByText('#CMSUKAV7').first() }).last();
    await jobCard.waitFor({ state: 'visible', timeout: 30000 });
    const riderSelect = jobCard.locator('select').first();
    const options = await riderSelect.locator('option').allInnerTexts();
    console.log('[DISPATCH] Rider options for #CMSUKAV7:', options);
    if (options.some((o) => o.includes('saikumarbali'))) {
        await riderSelect.selectOption({ label: 'saikumarbali' });
        await jobCard.getByRole('button', { name: 'Assign Rider' }).click();
        await page.waitForTimeout(6000);
    }
    const dispText = await page.evaluate(() => document.body.innerText);
    const cms = dispText.indexOf('#CMSUKAV7');
    console.log('[DISPATCH] After assign (around #CMSUKAV7):\n', dispText.substring(cms, cms + 800));
    await page.screenshot({ path: `${SHOT}/flow-02-assigned.png`, fullPage: true });
    await browser.close();
    console.log('\n=== ADMIN FLOW COMPLETE ===');
}
run().catch((e) => { console.error(e); process.exit(1); });
