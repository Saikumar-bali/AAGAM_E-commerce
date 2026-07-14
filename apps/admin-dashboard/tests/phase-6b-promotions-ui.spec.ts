import { expect, test } from "@playwright/test";
import path from "path";
import { loginWithCookieSession } from "./helpers/login";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
const screenshots = path.resolve(
  __dirname,
  "../../../docs/qa/phase-6b-promotions"
);
const headers = { "X-Requested-With": "XMLHttpRequest" };

async function switchRole(page: any, role: "ADMIN" | "CUSTOMER") {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await loginWithCookieSession(page, role);
}

test("Admin-published campaign and coupon drive Home, Deals, and Checkout", async ({
  page,
}) => {
  const suffix = Date.now().toString(36).toUpperCase();
  let campaignId = "";
  let couponId = "";

  await switchRole(page, "ADMIN");
  const couponResponse = await page.request.post(
    `${API_URL}/admin/promotions/coupons`,
    {
      headers,
      data: {
        code: `PW${suffix}`,
        name: `Playwright offer ${suffix}`,
        description: "A real server-validated proof coupon.",
        status: "ACTIVE",
        applicationMode: "CODE",
        discountType: "PERCENTAGE",
        percentageBps: 1000,
        maxDiscountPaise: 5000,
        minimumSubtotalPaise: 100,
        perCustomerLimit: 2,
        eligibilityScope: "ALL",
      },
    }
  );
  expect(couponResponse.ok()).toBeTruthy();
  couponId = (await couponResponse.json()).id;
  const campaignResponse = await page.request.post(
    `${API_URL}/admin/promotions/campaigns`,
    {
      headers,
      data: {
        internalName: `Playwright dynamic campaign ${suffix}`,
        title: `Live Admin Offer ${suffix}`,
        subtitle: "Published once, rendered from the API everywhere.",
        badgeText: "QA live",
        backgroundColor: "#0f172a",
        textColor: "#ffffff",
        accentColor: "#2dd4bf",
        ctaLabel: "View live deals",
        targetType: "DEALS",
        couponId,
        status: "ACTIVE",
        priority: 999,
        placements: ["HOME_HERO", "HOME_TODAY_OFFERS", "DEALS_PAGE"],
      },
    }
  );
  expect(campaignResponse.ok()).toBeTruthy();
  campaignId = (await campaignResponse.json()).id;

  await page.goto("/admin/promotions");
  await expect(
    page.getByRole("heading", { name: "Promotions & Coupons" })
  ).toBeVisible();
  await expect(page.getByText(`Live Admin Offer ${suffix}`)).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/01-admin-control-room.png`,
    fullPage: true,
  });

  await switchRole(page, "CUSTOMER");
  await page.goto("/shop");
  await expect(
    page.getByRole("heading", { name: `Live Admin Offer ${suffix}` }).first()
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/02-customer-dynamic-home.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /View live deals/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/shop\/deals/);
  await expect(page.getByText(`PW${suffix}`)).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/03-live-deals-and-coupon.png`,
    fullPage: true,
  });

  const [productsResponse, addressesResponse] = await Promise.all([
    page.request.get(`${API_URL}/products`, { headers }),
    page.request.get(`${API_URL}/customer/addresses`, { headers }),
  ]);
  const productsPayload = await productsResponse.json();
  const products = Array.isArray(productsPayload)
    ? productsPayload
    : productsPayload.items || [];
  const addresses = await addressesResponse.json();
  expect(products.length).toBeGreaterThan(0);
  expect(addresses.length).toBeGreaterThan(0);
  const product = products[0];
  await page.goto("/shop");
  await page.evaluate(
    (item) =>
      localStorage.setItem(
        "aagam_cart",
        JSON.stringify([
          {
            id: item.id,
            name: item.name,
            price: Number(item.price),
            quantity: 1,
            image: item.image,
          },
        ])
      ),
    product
  );
  await page.goto(`/shop/checkout?coupon=${encodeURIComponent(`PW${suffix}`)}`);
  await expect(page.getByTestId("checkout-coupon")).toContainText(
    `PW${suffix}`
  );
  await expect(page.getByTestId("checkout-coupon")).toContainText(/You save/);
  await page.screenshot({
    path: `${screenshots}/04-checkout-server-discount.png`,
    fullPage: true,
  });

  await switchRole(page, "ADMIN");
  if (campaignId)
    await page.request.delete(
      `${API_URL}/admin/promotions/campaigns/${campaignId}`,
      { headers }
    );
  if (couponId)
    await page.request.delete(
      `${API_URL}/admin/promotions/coupons/${couponId}`,
      { headers }
    );
});
