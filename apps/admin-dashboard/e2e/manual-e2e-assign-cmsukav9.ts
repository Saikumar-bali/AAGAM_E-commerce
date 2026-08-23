import { chromium } from 'playwright';

const BASE = 'https://aagaam.in';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="Phone or email"]', 'aagaam@gmail.com');
  await page.fill('input[type="password"]', 'Aagam@2026#');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 60000 });

  await page.goto(`${BASE}/admin/dispatch`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  const txt = await page.evaluate(() => document.body.innerText);
  const i = txt.indexOf('AVAILABLE RIDERS');
  console.log('[DISPATCH] Stats:\n', txt.substring(Math.max(0, i - 300), i + 300));

  const jobCard = page.locator('section, div').filter({ hasText: '#CMSUKAV9' }).filter({ has: page.getByRole('button', { name: 'Assign Rider' }) }).last();
  const select = jobCard.locator('select').first();
  const optionCount = await select.locator('option').count();
  console.log('[DISPATCH] Rider options count:', optionCount);
  const opts = await select.locator('option').allInnerTexts();
  console.log('[DISPATCH] Rider options:', JSON.stringify(opts));
  if (optionCount > 0) {
    await select.selectOption({ label: 'saikumarbali' });
    await jobCard.getByRole('button', { name: 'Assign Rider' }).click();
    await page.waitForTimeout(6000);
    const txt2 = await page.evaluate(() => document.body.innerText);
    const m = txt2.indexOf('could not be completed');
    const s = txt2.indexOf('assigned');
    if (m >= 0) console.log('[DISPATCH] Error:', txt2.substring(Math.max(0, m - 200), m + 80));
    if (s >= 0) console.log('[DISPATCH] Toast:', txt2.substring(Math.max(0, s - 160), s + 100));
    const t3 = await page.evaluate(() => document.body.innerText);
    const k = t3.indexOf('#CMSUKAV9');
    console.log('[DISPATCH] After assign:\n', t3.substring(k - 200, k + 500));
  }
  await browser.close();
  console.log('=== ASSIGN ATTEMPT COMPLETE ===');
}

main().catch((e) => { console.error(e); process.exit(1); });