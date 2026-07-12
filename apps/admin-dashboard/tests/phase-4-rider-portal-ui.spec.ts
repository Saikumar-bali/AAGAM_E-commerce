import { expect, test } from "@playwright/test";
import path from "path";
import { loginWithCookieSession } from "./helpers/login";

const screenshots = path.resolve(
  __dirname,
  "../../../docs/qa/phase-4-rider-portal"
);

test.beforeEach(async ({ page }) => {
  await loginWithCookieSession(page, "RIDER");
});

test("Rider home exposes real operational cards and unread notifications", async ({
  page,
}) => {
  await page.goto("/rider");
  await expect(page.getByRole("heading", { name: "Rider Home" })).toBeVisible();
  await expect(page.getByText("Pending offers", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Completed today", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Operational alerts", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/rating/i)).toHaveCount(0);
  await page.screenshot({
    path: `${screenshots}/01-rider-home.png`,
    fullPage: true,
  });
});

test("Offer, delivery, and pickup routes render role-scoped operational states", async ({
  page,
}) => {
  for (const [route, heading] of [
    ["/rider/offers", "Job Offers"],
    ["/rider/delivery", "Current Delivery"],
    ["/rider/pickup", "Pickup Tasks"],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.screenshot({
    path: `${screenshots}/02-rider-pickup.png`,
    fullPage: true,
  });
});

test("History and finance pages never convert customer order totals into earnings", async ({
  page,
}) => {
  await page.goto("/rider/history");
  await expect(
    page.getByRole("heading", { name: "Delivery History" })
  ).toBeVisible();
  await expect(
    page.getByText(/order totals are never treated as Rider earnings/i)
  ).toBeVisible();
  await page.goto("/rider/earnings");
  await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();
  await expect(page.getByText(/Only persisted earning records/i)).toBeVisible();
  await page.goto("/rider/cod");
  await expect(
    page.getByRole("heading", { name: "COD & Settlements" })
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/03-rider-cod.png`,
    fullPage: true,
  });
});

test("Availability, profile, performance, notifications, and support routes render", async ({
  page,
}) => {
  for (const [route, heading] of [
    ["/rider/availability", "Availability & Shift"],
    ["/rider/profile", "Profile & Documents"],
    ["/rider/performance", "Performance"],
    ["/rider/notifications", "Rider Notifications"],
    ["/rider/support", "Rider Support"],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.screenshot({
    path: `${screenshots}/04-rider-support.png`,
    fullPage: true,
  });
});
