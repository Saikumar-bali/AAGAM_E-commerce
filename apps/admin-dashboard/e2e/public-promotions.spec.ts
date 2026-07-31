import { APIRequestContext, expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
const adminEmail = process.env.ADMIN_EMAIL || process.env.CI_ADMIN_EMAIL || 'admin@aagam.com';
const adminPassword = process.env.ADMIN_PASSWORD || process.env.CI_ADMIN_PASSWORD || 'admin@2026!';
const PROOF_DIR = path.resolve(__dirname, '../../../docs/qa/promotions-search-category-crash');

const ts = () => Date.now().toString(36);

async function adminBearer(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_BASE}/auth/mobile/login`, {
    data: { identifier: adminEmail, password: adminPassword },
  });
  expect(login.ok(), `Admin login failed: ${await login.text()}`).toBeTruthy();
  return (await login.json()).access_token as string;
}

async function createCampaign(
  request: APIRequestContext,
  token: string,
  placement: string,
  title: string,
  status?: string,
  endsAt?: string,
) {
  const suffix = ts();
  const res = await request.post(`${API_BASE}/admin/promotions/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      internalName: `Playwright public promo ${suffix}`,
      title,
      subtitle: `Subtitle ${suffix}`,
      badgeText: 'PW Test',
      ...(status ? { status } : {}),
      ...(endsAt ? { endsAt } : {}),
      placements: [placement],
      targetType: 'DEALS',
      priority: 1000,
    },
  });
  expect(res.ok(), `Create campaign failed: ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function archiveCampaign(request: APIRequestContext, token: string, id: string) {
  const response = await request.delete(`${API_BASE}/admin/promotions/campaigns/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `Campaign cleanup failed: ${await response.text()}`).toBeTruthy();
}

test.describe('Public promotions placement rendering', () => {
  let token: string;
  const campaignIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    mkdirSync(PROOF_DIR, { recursive: true });
    token = await adminBearer(request);
  });

  test.afterAll(async ({ request }) => {
    for (const id of campaignIds) {
      await archiveCampaign(request, token, id);
    }
  });

  test('default campaign status publishes to the customer shop feed', async ({ page, request }) => {
    const suffix = ts();
    const title = `PW Default Publish ${suffix}`;
    const campaign = await createCampaign(request, token, 'HOME_HERO', title);
    campaignIds.push(campaign.id);

    const publicFeed = await request.get(`${API_BASE}/promotions/active`);
    expect(publicFeed.ok(), `Public promotion feed failed: ${await publicFeed.text()}`).toBeTruthy();
    expect(JSON.stringify(await publicFeed.json())).toContain(title);

    await page.goto('/shop');
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: path.join(PROOF_DIR, '00-default-publish-shop.png'),
      fullPage: true,
    });
  });

  test('expired campaigns are excluded from the customer feed', async ({ request }) => {
    const suffix = ts();
    const title = `PW Expiring Campaign ${suffix}`;
    const campaign = await createCampaign(
      request,
      token,
      'HOME_HERO',
      title,
      'ACTIVE',
      new Date(Date.now() + 1500).toISOString(),
    );
    campaignIds.push(campaign.id);

    await new Promise((resolve) => setTimeout(resolve, 2200));
    const publicFeed = await request.get(`${API_BASE}/promotions/active`);
    expect(publicFeed.ok(), `Public promotion feed failed: ${await publicFeed.text()}`).toBeTruthy();
    expect(JSON.stringify(await publicFeed.json())).not.toContain(title);
  });

  test('login page renders LOGIN_SIDEBAR campaign', async ({ page, request }) => {
    const suffix = ts();
    const title = `PW Login Campaign ${suffix}`;
    const campaign = await createCampaign(request, token, 'LOGIN_SIDEBAR', title);
    campaignIds.push(campaign.id);

    await page.goto('/login');
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: path.join(PROOF_DIR, '01-login-sidebar-campaign.png'),
      fullPage: true,
    });
  });

  test('landing page renders LANDING_HERO and LANDING_BANNER', async ({ page, request }) => {
    const suffix = ts();
    const heroTitle = `PW Hero ${suffix}`;
    const bannerTitle = `PW Banner ${suffix}`;

    const hero = await createCampaign(request, token, 'LANDING_HERO', heroTitle);
    campaignIds.push(hero.id);

    const banner = await createCampaign(request, token, 'LANDING_BANNER', bannerTitle);
    campaignIds.push(banner.id);

    await page.goto('/');
    await expect(page.getByText(heroTitle).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: path.join(PROOF_DIR, '02-landing-hero-campaign.png'),
      fullPage: true,
    });

    const bannerEl = page.getByText(bannerTitle).first();
    await expect(bannerEl).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: path.join(PROOF_DIR, '03-landing-banner-campaign.png'),
      fullPage: true,
    });

    const bannerLink = bannerEl.locator('xpath=ancestor::a');
    await expect(bannerLink).toHaveAttribute('href', '/shop/deals');
  });
});
