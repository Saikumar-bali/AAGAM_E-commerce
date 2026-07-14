# Phase 6B — Promotion and Coupon Scenario Proof

Use a deployed revision containing the Phase 6B migration. Record the exact Git commit and environment URL in every GitHub proof issue. Do not use production customer accounts for limit tests.

## 1. Admin campaign lifecycle

1. Sign in as Admin and open `/admin/promotions`.
2. Create a Draft campaign with a desktop creative and optional mobile creative.
3. Assign all three placements and save.
4. Confirm it is absent from the customer Home and Deals while Draft.
5. Publish it and confirm it appears without rebuilding the frontend.
6. Pause it and confirm it disappears after refresh.
7. Schedule a future start and confirm `SCHEDULED` is shown but the customer cannot see it early.
8. Set an end time, pass that time, and confirm it is reported as expired and no longer returned publicly.
9. Archive the campaign and confirm it cannot be republished through customer APIs.

Proof: Admin list screenshots for Draft, Active, Paused/Scheduled; customer Home/Deals screenshots; API responses with IDs and timestamps.

## 2. Placements, priority, and click targets

1. Publish at least two Home hero campaigns with different priorities.
2. Confirm the higher-priority campaign appears first and carousel controls rotate both.
3. Publish Today’s Offers-only and Deals-only campaigns and confirm there is no placement leakage.
4. Verify click-throughs for Product, Category, Deals, and an internal `/shop` path.
5. Attempt an external or protocol-relative path and confirm the API rejects it.
6. Open the Home page at mobile width and confirm the mobile creative is selected when configured.

Proof: Home desktop/mobile screenshots, target URLs after each click, rejected external-target response.

## 3. Coupon rule matrix

Create and verify:

- percentage with and without a maximum discount;
- fixed discount capped at the eligible subtotal;
- free delivery that discounts only the real delivery fee;
- minimum cart rejection;
- all-product, selected-product, and selected-category eligibility;
- one-store restriction and rejection at another store;
- first-order-only acceptance and rejection;
- total usage limit and per-customer limit;
- automatic coupon priority;
- a paused, future, expired, and archived coupon.

For every successful quote, capture subtotal, delivery fee, discount, and grand total. Verify `grandTotalPaise = subtotalPaise + deliveryFeePaise + taxPaise - discountPaise`.

## 4. Deals and honest empty states

1. With no active campaign/coupon, confirm Home and Deals show honest empty states.
2. Publish a code coupon and confirm its code is copyable.
3. Publish an automatic coupon and confirm its internal code is not displayed on Deals.
4. Exhaust a customer limit and confirm Deals shows the account-specific ineligibility reason.
5. Confirm the previous WELCOME10, FREEDEL, and ESSENTIALS50 samples never appear unless Admin creates those exact real coupons.

## 5. Checkout and atomic redemption

1. Enter a valid code and confirm Checkout displays the server-calculated savings.
2. Enter an invalid, paused, future, expired, wrong-store, below-minimum, or ineligible-cart code and confirm no discount is retained.
3. Place COD and confirm one `REDEEMED` redemption with code and rule snapshots.
4. Place an online order and confirm `RESERVED` before capture.
5. Capture payment and confirm `REDEEMED`.
6. Fail a separate online payment and confirm `RELEASED` with a reason, then reuse the coupon.
7. Cancel a discounted COD order and confirm its redemption is released.
8. Submit concurrent final-order requests at the last global/per-customer use. Confirm no over-redemption; one request must refresh or fail.
9. Change/pause the coupon between Quote and Place Order and confirm the API refuses stale pricing.
10. Confirm payment amount equals the discounted order grand total, not the original cart total.

Proof: quote/place/payment JSON, database redemption rows, order pricing snapshot, Checkout screenshots before and after application.

## 6. Role and security checks

1. Customer cannot call any `/admin/promotions/*` endpoint.
2. Admin cannot use customer-only promotion endpoints as a substitute customer.
3. Unauthenticated callers receive 401.
4. Invalid product/category/store IDs are rejected.
5. Coupon discount, usage, first-order, and store rules cannot be bypassed by changing browser JSON.
6. Promotion upload accepts only Admin and supported image types under 5 MB.

## Automated proof

- API/database: `npm run test:promotions`
- Admin/customer headed flow: `npx playwright test --project=phase-6b-promotions`
- Screenshot output: `docs/qa/phase-6b-promotions/`

Upload only proof produced against the exact deployed commit. Keep GitHub scenario issues open until the corresponding evidence has been reviewed.
