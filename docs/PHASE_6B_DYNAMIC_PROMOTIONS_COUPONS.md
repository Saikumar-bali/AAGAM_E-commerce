# Phase 6B — Dynamic Promotions, Offers, and Coupons

## Outcome

The customer Home hero, Today’s Offers, and Deals page are now controlled by Admin data. Static offer arrays and sample coupon warnings have been removed. Discounts are calculated in integer paise by the API and persisted separately from subtotal, delivery fee, tax, and grand total.

## Admin control room

Route: `/admin/promotions`

Admin can:

- create, edit, pause, publish, schedule, and archive campaigns;
- place a campaign in `HOME_HERO`, `HOME_TODAY_OFFERS`, and/or `DEALS_PAGE`;
- upload desktop and mobile creative images to the configured public R2 bucket;
- set title, copy, badge, colors, CTA, priority, and first-order targeting;
- target a product, category, Deals page, or allowlisted internal `/shop` path;
- create code-based or automatic coupons;
- create percentage, fixed-value, and free-delivery rules;
- cap percentage discounts and require a minimum subtotal;
- restrict coupons by store, products, or categories;
- set total and per-customer usage limits, first-order-only rules, priority, and active dates.

External URLs are rejected. Campaign click targets stay inside `/shop`.

## Customer behavior

- Home loads active placements from `GET /promotions/active`.
- The hero auto-advances only through currently active campaigns.
- Today’s Offers contains only Admin-published campaigns.
- Category campaigns deep-link into the filtered catalog.
- Deals loads active campaigns and coupons from `GET /promotions/deals`.
- Automatic coupon internal keys are not exposed on Deals.
- Account-ineligible coupons display the real reason rather than appearing usable.
- Deals can pass a code to Checkout; Checkout still asks the API to validate it.
- If no campaign/coupon is active, the UI shows an honest empty state rather than invented savings.

## Pricing and redemption invariants

1. The browser never supplies a discount amount.
2. Quote recomputes item prices, store, delivery fee, eligible subtotal, discount, and grand total.
3. Place Order evaluates the coupon again inside a serializable database transaction.
4. If availability or the calculated discount changed after quote, order creation returns a conflict and asks the customer to refresh.
5. A COD coupon is recorded as `REDEEMED` with the order.
6. An online-payment coupon is first `RESERVED`, becomes `REDEEMED` after capture, and becomes `RELEASED` after payment failure.
7. Customer cancellation, Admin cancellation, and allowed status cancellation release the redemption.
8. Usage limits count only `RESERVED` and `REDEEMED`; released attempts can be retried.
9. Every redemption stores the code snapshot, discount paise, and rule snapshot used at order time.
10. Order `discountPaise`, `discountAmount`, `grandTotalPaise`, payment amount, and pricing snapshot use the same server result.

## Data model

- `PromotionCampaign`
- `PromotionPlacementAssignment`
- `Coupon`
- `CouponProductEligibility`
- `CouponCategoryEligibility`
- `CouponRedemption`

Migration: `20260713170000_phase_6_dynamic_promotions_coupons`

## API surface

Customer (`CUSTOMER` only):

- `GET /promotions/active`
- `GET /promotions/deals`
- `POST /checkout/quote` with optional `couponCode`
- `POST /checkout/place-order` with optional `couponCode`

Admin (`ADMIN` only):

- `GET|POST /admin/promotions/campaigns`
- `PATCH|DELETE /admin/promotions/campaigns/:id`
- `GET|POST /admin/promotions/coupons`
- `PATCH|DELETE /admin/promotions/coupons/:id`
- `POST /upload/promotion-image`

## Validation commands

```bash
npx prisma validate --schema packages/database/prisma/schema.prisma
npm run build:api
npm run build:admin
npm run test:promotions
npx playwright test --project=phase-6b-promotions
```

Database-backed tests require `DATABASE_URL`. Headed browser proof additionally requires the API and web app plus `QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD`, `QA_CUSTOMER_EMAIL`, and `QA_CUSTOMER_PASSWORD`.
