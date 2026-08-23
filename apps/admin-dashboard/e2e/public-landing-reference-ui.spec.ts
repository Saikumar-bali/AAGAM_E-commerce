import { expect, test } from '@playwright/test';

const heroCampaign = {
  id: 'landing-hero-1',
  title: 'Fresh groceries.',
  subtitle: 'Delivered with trust.',
  description: 'From farm to your home – handpicked quality, local stores and on-time delivery you can count on.',
  badgeText: 'Farm fresh. Locally sourced.',
  imageUrl: 'https://cdn.example.test/aagaam-landing-hero.webp',
  mobileImageUrl: 'https://cdn.example.test/aagaam-landing-hero-mobile.webp',
  backgroundColor: '#073f3d',
  textColor: '#ffffff',
  accentColor: '#20c9a6',
  ctaLabel: 'Shop now',
  targetUrl: '/shop',
};

const bannerCampaign = {
  id: 'landing-banner-1',
  title: 'Supporting local farmers',
  subtitle: 'We work directly with farmers to bring you fresh produce and a better tomorrow.',
  imageUrl: 'https://cdn.example.test/aagaam-farmer-banner.webp',
  backgroundColor: '#f7faf8',
  textColor: '#163a2f',
  accentColor: '#087765',
  ctaLabel: 'Know more',
  targetUrl: '/shop',
};

const products = [
  {
    id: 'tomato-1',
    name: 'Tomato Hybrid',
    price: 24,
    mrpPaise: 3000,
    image: 'https://cdn.example.test/tomato.webp',
    categoryId: 'veg',
    category: { id: 'veg', name: 'Vegetables' },
    availability: { isVisible: true, inStock: true },
  },
  {
    id: 'banana-1',
    name: 'Banana Robusta',
    price: 36,
    mrpPaise: 4500,
    image: 'https://cdn.example.test/banana.webp',
    categoryId: 'fruit',
    category: { id: 'fruit', name: 'Fruits' },
    availability: { isVisible: true, inStock: true },
  },
];

const categories = [
  { id: 'veg', name: 'Vegetables', imageUrl: 'https://cdn.example.test/vegetables.webp' },
  { id: 'fruit', name: 'Fruits', imageUrl: 'https://cdn.example.test/fruits.webp' },
];

const plans = [
  {
    id: 'daily-milk-plan',
    name: 'Daily Milk Plan',
    description: '1 L toned milk every day',
    pricePaise: 148500,
    mrpPaise: 165000,
    totalDeliveries: 30,
    imageUrl: 'https://cdn.example.test/milk-plan.webp',
  },
];

test.describe('Public reference landing UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/products/categories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(categories) });
    });
    await page.route('**/products?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: products, page: 1, pageSize: 12, total: products.length, totalPages: 1 }),
      });
    });
    await page.route('**/subscriptions/plans**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plans) });
    });
    await page.route('**/public/promotions/active**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          serverTime: new Date().toISOString(),
          placements: {
            LANDING_HERO: [heroCampaign],
            LANDING_BANNER: [bannerCampaign],
          },
        }),
      });
    });
    await page.route('https://cdn.example.test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500"><rect width="100%" height="100%" fill="#0a5b4e"/></svg>',
      });
    });
  });

  test('matches the reference structure and consumes existing public APIs', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Fresh groceries.', { exact: true })).toBeVisible();
    await expect(page.getByText('Delivered with trust.', { exact: true })).toBeVisible();
    await expect(page.getByText('Shop by category', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vegetables' }).first()).toHaveAttribute('href', '/shop?category=veg');
    await expect(page.getByText('Featured Products', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tomato Hybrid', exact: true }).last()).toHaveAttribute('href', '/shop/products/tomato-1');
    await expect(page.getByText('Subscribe & Save', { exact: true })).toBeVisible();
    await expect(page.getByText('Daily Milk Plan', { exact: true })).toBeVisible();
    await expect(page.getByText('Supporting local farmers', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Aagaam' }).first()).toBeVisible();

    const heroImage = page.locator('img[src="https://cdn.example.test/aagaam-landing-hero.webp"]');
    await expect(heroImage).toBeVisible();
    const farmerImage = page.locator('img[src="https://cdn.example.test/aagaam-farmer-banner.webp"]');
    await expect(farmerImage).toBeVisible();

    await page.getByRole('button', { name: 'Add to Cart' }).first().click();
    const cart = await page.evaluate(() => JSON.parse(window.localStorage.getItem('aagam_cart') || '[]'));
    expect(cart).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'tomato-1', quantity: 1 })]));

    await expect(page.getByRole('link', { name: 'Subscribe now' })).toHaveAttribute('href', '/shop/subscribe/daily-milk-plan');
    await expect(page.getByRole('link', { name: 'View all plans' })).toHaveAttribute('href', '/shop/subscriptions');
    await expect(page.getByRole('link', { name: /Shop now/ }).first()).toHaveAttribute('href', '/shop');
    await expect(page.getByRole('link', { name: 'Terms & Conditions' })).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    await expect(page.getByLabel('Newsletter email')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Subscribe', exact: true })).toHaveCount(0);
  });

  test('renders a mobile-only Admin hero campaign', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.unroute('**/public/promotions/active**');
    await page.route('**/public/promotions/active**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          placements: {
            LANDING_HERO: [{ ...heroCampaign, imageUrl: null }],
            LANDING_BANNER: [],
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page.locator('img[src="https://cdn.example.test/aagaam-landing-hero-mobile.webp"]')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Landing sections' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Landing sections' }).getByRole('link', { name: 'Subscriptions' }).click();
    await expect(page).toHaveURL(/#subscriptions$/);
    await expect(page.locator('#subscriptions')).toBeInViewport();
  });

  test('shop consumes the landing search query when loading products', async ({ page }) => {
    await page.route('**/auth/me**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'customer-1', role: 'CUSTOMER', roles: ['CUSTOMER'], name: 'Test Customer' }),
      });
    });
    await page.route('**/promotions/active**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ placements: {} }) });
    });

    const matchingProductRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith('/products') && url.searchParams.get('search') === 'Banana';
    });

    await page.goto('/shop?search=Banana');
    await matchingProductRequest;
    await expect(page.getByPlaceholder('Search groceries, essentials...')).toHaveValue('Banana');
  });

  test('publishes real public terms and privacy pages', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms & Conditions' })).toBeVisible();
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  });

  test('falls back cleanly when the landing campaign feed is empty', async ({ page }) => {
    await page.unroute('**/public/promotions/active**');
    await page.route('**/public/promotions/active**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ placements: {} }) });
    });

    await page.goto('/');
    await expect(page.getByText('Fresh groceries.', { exact: true })).toBeVisible();
    await expect(page.getByText('Delivered with trust.', { exact: true })).toBeVisible();
    await expect(page.getByText('Tomato Hybrid', { exact: true })).toBeVisible();
  });
});
