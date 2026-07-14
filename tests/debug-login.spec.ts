import { test, expect } from '@playwright/test';

const LIVE_SITE = 'https://aagam-admin.pages.dev';

test('debug login - capture ALL network', async ({ page }) => {
  page.on('response', async (response) => {
    const url = response.url();
    const req = response.request();
    if (!url.includes('_next/static/chunks') && !url.includes('.css') && !url.includes('.woff')) {
      const status = response.status();
      let body = '';
      try { body = await response.text(); } catch {}
      console.log(`[NET] ${req.method()} ${url} => ${status} ${body.substring(0, 500)}`);
    }
  });

  page.on('requestfailed', (request) => {
    console.log(`[FAILED] ${request.method()} ${request.url()} => ${request.failure()?.errorText}`);
  });

  // Check console for errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  await page.goto(`${LIVE_SITE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  console.log('Login page loaded');

  await page.fill('input[type="email"]', 'admin@aagam.com');
  await page.fill('input[type="password"]', 'TestPass123!');
  
  console.log('Clicking submit...');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(15000);
  console.log('Final URL:', page.url());
});
