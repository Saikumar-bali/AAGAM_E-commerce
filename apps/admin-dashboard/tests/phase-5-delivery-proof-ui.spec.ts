import { expect, test } from "@playwright/test";
import path from "path";
import { loginWithCookieSession } from "./helpers/login";

const screenshots = path.resolve(
  __dirname,
  "../../../docs/qa/phase-5-delivery-proof"
);

test("Store can open role-scoped pickup proof controls", async ({ page }) => {
  await loginWithCookieSession(page, "STORE_OWNER");
  await page.goto("/store/pickup-proof");
  await expect(
    page.getByRole("heading", { name: "Pickup Proof" })
  ).toBeVisible();
  await expect(page.getByText(/one-time store PIN\/QR/i)).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/01-store-pickup-proof.png`,
    fullPage: true,
  });
});

test("Rider pickup and delivery pages expose professional proof controls", async ({
  page,
}) => {
  await loginWithCookieSession(page, "RIDER");
  await page.goto("/rider/pickup");
  await expect(
    page.getByRole("heading", { name: "Pickup Tasks" })
  ).toBeVisible();
  await page.goto("/rider/delivery");
  await expect(
    page.getByRole("heading", { name: "Current Delivery" })
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/02-rider-delivery-proof.png`,
    fullPage: true,
  });
});

test("Admin exception queue exposes system resolution and audited override workflow", async ({
  page,
}) => {
  await loginWithCookieSession(page, "ADMIN");
  await page.goto("/admin/delivery-exceptions");
  await expect(
    page.getByRole("heading", { name: "Delivery Exceptions" })
  ).toBeVisible();
  await expect(page.getByText(/delivery control room/i)).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/03-admin-failure-resolution.png`,
    fullPage: true,
  });
});

test("Rider COD page identifies the independent real ledger", async ({
  page,
}) => {
  await loginWithCookieSession(page, "RIDER");
  await page.goto("/rider/cod");
  await expect(
    page.getByRole("heading", { name: "COD & Settlements" })
  ).toBeVisible();
  await expect(
    page.getByText(/Rider earnings never enter this ledger/i)
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/04-rider-cod-ledger.png`,
    fullPage: true,
  });
});
