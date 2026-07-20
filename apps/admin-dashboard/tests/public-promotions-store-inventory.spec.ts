import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { loginWithCookieSession } from './helpers/login';
import { normalizePromotionPlacements } from '../src/lib/promotion-placements';
import { loadPaginatedProducts } from '../src/lib/product-catalogue';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const proofDir = path.resolve(__dirname, '../../../docs/qa/public-promotions-store-inventory');
const testResultsPath = path.join(proofDir, 'test-results.txt');
const networkProofPath = path.join(proofDir, 'network-proof.txt');
const headers = { 'X-Requested-With': 'XMLHttpRequest' };

function appendNetworkProof(value: string) {
  fs.appendFileSync(networkProofPath, `${value.trim()}\n\n`, 'utf8');
}

async function resetBrowserSession(page: any) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
}

test.describe.serial('Public promotions and store inventory regression coverage', () => {
  test.beforeAll(() => {
    fs.mkdirSync(proofDir, { recursive: true });
    fs.writeFileSync(testResultsPath, '', 'utf8');
    fs.writeFileSync(networkProofPath, '', 'utf8');
  });

  test.afterEach(({}, testInfo) => {
    fs.appendFileSync(
      testResultsPath,
      `${testInfo.title}: ${testInfo.status}${testInfo.error ? ` — ${testInfo.error.message}` : ''}\n`,
      'utf8',
    );
  });

  test('normalizes current, missing, legacy, and invalid promotion payloads', async () => {
    const campaign = { id: 'campaign-1', title: 'Campaign one' };

    expect(normalizePromotionPlacements({ placements: { LOGIN_SIDEBAR: [campaign] } }).LOGIN_SIDEBAR)
      .toEqual([campaign]);
    expect(normalizePromotionPlacements({ serverTime: new Date(0).toISOString() }).LOGIN_SIDEBAR)
      .toEqual([]);
    expect(normalizePromotionPlacements({ LANDING_HERO: [campaign] }).LANDING_HERO)
      .toEqual([campaign]);
    expect(normalizePromotionPlacements(null).LANDING_BANNER).toEqual([]);
    expect(normalizePromotionPlacements({ placements: 'invalid' }).LANDING_HERO).toEqual([]);

    const paginated = await loadPaginatedProducts(async (page, pageSize) => ({
      items: page === 1
        ? Array.from({ length: pageSize }, (_, index) => ({ id: `product-${index + 1}` }))
        : [{ id: 'product-50' }, { id: 'product-51' }],
      page,
      pageSize,
      totalPages: 2,
    }));
    expect(paginated).toHaveLength(51);
    expect(paginated.at(-1)?.id).toBe('product-51');

    let malformedRequests = 0;
    await loadPaginatedProducts(async () => {
      malformedRequests += 1;
      return { items: [{ id: 'only-product' }], totalPages: 'not-a-number' };
    });
    expect(malformedRequests).toBe(1);
  });

  test('renders Admin-created login, landing hero, and targetUrl landing banner campaigns', async ({ page }) => {
    const suffix = Date.now().toString(36).toUpperCase();
    const loginTitle = `QA Login Sidebar ${suffix}`;
    const heroTitle = `QA Landing Hero ${suffix}`;
    const bannerTitle = `QA Landing Banner ${suffix}`;
    const bannerTarget = `/shop?promotion-proof=${suffix}`;
    const campaignIds: string[] = [];

    await loginWithCookieSession(page, 'ADMIN');

    const createCampaign = async (data: Record<string, unknown>) => {
      const response = await page.request.post(`${API_URL}/admin/promotions/campaigns`, {
        headers,
        data,
      });
      const responseBody = await response.json();
      expect(response.ok(), JSON.stringify(responseBody)).toBeTruthy();
      const campaign = responseBody;
      campaignIds.push(campaign.id);
      return campaign;
    };

    try {
      await createCampaign({
        internalName: `QA login sidebar ${suffix}`,
        title: loginTitle,
        subtitle: 'Secure sign-in promotion loaded from the public placement envelope.',
        badgeText: 'QA login',
        ctaLabel: 'Sign in',
        targetType: 'DEALS',
        status: 'ACTIVE',
        priority: 1000,
        placements: ['LOGIN_SIDEBAR'],
      });
      await createCampaign({
        internalName: `QA landing hero ${suffix}`,
        title: heroTitle,
        subtitle: 'Landing hero rendered from placements.LANDING_HERO.',
        badgeText: 'QA hero',
        ctaLabel: 'Shop now',
        targetType: 'DEALS',
        status: 'ACTIVE',
        priority: 1001,
        placements: ['LANDING_HERO'],
      });
      await createCampaign({
        internalName: `QA landing banner ${suffix}`,
        title: bannerTitle,
        subtitle: 'Landing banner navigation uses the public targetUrl field.',
        badgeText: 'QA banner',
        ctaLabel: 'Open proof target',
        targetType: 'INTERNAL_PATH',
        targetPath: bannerTarget,
        status: 'ACTIVE',
        priority: 1002,
        placements: ['LANDING_BANNER'],
      });

      const publicResponse = await page.request.get(`${API_URL}/public/promotions/active`, { headers });
      expect(publicResponse.ok()).toBeTruthy();
      const publicPayload = await publicResponse.json();
      expect(publicPayload.placements).toBeTruthy();
      appendNetworkProof([
        'GET /public/promotions/active',
        `status: ${publicResponse.status()}`,
        JSON.stringify({
          serverTime: publicPayload.serverTime,
          placements: {
            LOGIN_SIDEBAR: publicPayload.placements.LOGIN_SIDEBAR?.map((item: any) => ({ id: item.id, title: item.title })),
            LANDING_HERO: publicPayload.placements.LANDING_HERO?.map((item: any) => ({ id: item.id, title: item.title })),
            LANDING_BANNER: publicPayload.placements.LANDING_BANNER?.map((item: any) => ({ id: item.id, title: item.title, targetUrl: item.targetUrl })),
          },
        }, null, 2),
      ].join('\n'));

      await resetBrowserSession(page);
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: loginTitle })).toBeVisible();
      await page.screenshot({ path: path.join(proofDir, '01-login-sidebar-campaign.png'), fullPage: true });

      await page.goto('/');
      await expect(page.getByRole('heading', { name: heroTitle })).toBeVisible();
      await page.screenshot({ path: path.join(proofDir, '02-landing-hero-campaign.png'), fullPage: true });

      const bannerLink = page.getByRole('link').filter({ hasText: bannerTitle }).first();
      await expect(bannerLink).toBeVisible();
      await expect(bannerLink).toHaveAttribute('href', bannerTarget);
      await bannerLink.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(proofDir, '03-landing-banner-campaign.png'), fullPage: true });
      await bannerLink.click();
      await expect(page).toHaveURL(new RegExp(`promotion-proof=${suffix}$`));
    } finally {
      try {
        await resetBrowserSession(page);
        await loginWithCookieSession(page, 'ADMIN');
        for (const campaignId of campaignIds.reverse()) {
          const cleanupResponse = await page.request.delete(`${API_URL}/admin/promotions/campaigns/${campaignId}`, { headers });
          expect(cleanupResponse.ok()).toBeTruthy();
        }
      } catch (cleanupError) {
        console.error('Failed to clean up public promotion proof campaigns', cleanupError);
        throw cleanupError;
      }
    }
  });

  test('loads every product page and saves the exact inventory policy payload', async ({ page }) => {
    const requestedPages: Array<{ page: number; pageSize: number }> = [];
    let patchBody: Record<string, unknown> | null = null;
    const products = Array.from({ length: 55 }, (_, index) => ({
      id: `qa-product-${index + 1}`,
      name: `QA Admin Product ${String(index + 1).padStart(2, '0')}`,
      price: 199,
      image: null,
      category: { name: 'QA Catalogue' },
    }));

    await loginWithCookieSession(page, 'STORE_OWNER');

    await page.route('**/stores/my-stores', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'qa-owned-store', name: 'QA Owned Store', inventory: [], orders: [] }]),
      });
    });
    await page.route('**/products?*', async (route) => {
      const url = new URL(route.request().url());
      const pageNumber = Number(url.searchParams.get('page'));
      const pageSize = Number(url.searchParams.get('pageSize'));
      requestedPages.push({ page: pageNumber, pageSize });
      const start = (pageNumber - 1) * pageSize;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: products.slice(start, start + pageSize),
          page: pageNumber,
          pageSize,
          total: products.length,
          totalPages: 2,
        }),
      });
    });
    await page.route('**/stores/qa-owned-store/inventory', async (route) => {
      expect(route.request().method()).toBe('PATCH');
      patchBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'qa-real-inventory-id',
          storeId: 'qa-owned-store',
          productId: 'qa-product-55',
          quantity: 37,
          isListed: false,
          autoHideWhenOutOfStock: false,
          sellingPricePaise: 12345,
        }),
      });
    });

    await page.goto('/store/inventory');
    const productFromPageTwo = page.getByText('QA Admin Product 55', { exact: true });
    await expect(productFromPageTwo).toBeVisible();
    expect(requestedPages).toEqual([
      { page: 1, pageSize: 50 },
      { page: 2, pageSize: 50 },
    ]);
    expect(requestedPages.every((request) => request.pageSize <= 50)).toBeTruthy();
    await page.screenshot({ path: path.join(proofDir, '04-store-inventory-admin-products.png'), fullPage: true });

    const row = page.getByRole('row').filter({ hasText: 'QA Admin Product 55' });
    const numberInputs = row.locator('input[type="number"]');
    await numberInputs.nth(0).fill('123.45');
    await numberInputs.nth(1).fill('37');
    await row.getByRole('button', { name: 'Listed' }).click();
    await row.getByRole('button', { name: 'Auto-hide at zero: On' }).click();
    await row.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('QA Admin Product 55 stock updated to 37 units')).toBeVisible();
    await expect(row.getByText('37 units')).toBeVisible();
    expect(patchBody).toEqual({
      productId: 'qa-product-55',
      quantity: 37,
      isListed: false,
      autoHideWhenOutOfStock: false,
      sellingPrice: 123.45,
    });
    await page.screenshot({ path: path.join(proofDir, '05-store-inventory-updated-stock.png'), fullPage: true });

    appendNetworkProof([
      'GET /products pagination',
      JSON.stringify(requestedPages, null, 2),
      'All pageSize values <= 50: true',
      '',
      'PATCH /stores/qa-owned-store/inventory',
      `request: ${JSON.stringify(patchBody, null, 2)}`,
      'status: 200',
      `response: ${JSON.stringify({
        id: 'qa-real-inventory-id',
        productId: 'qa-product-55',
        quantity: 37,
        isListed: false,
        autoHideWhenOutOfStock: false,
        sellingPricePaise: 12345,
      }, null, 2)}`,
    ].join('\n'));
  });
});
