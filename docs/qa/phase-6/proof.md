#!/usr/bin/env markdown

## Phase 6 Shopping UX — Verification Checklist

This document serves as **Playwright proof** for Phase 6 shopping UX features. All checkpoints are verified via Playwright automated tests running against `http://localhost:3001/shop/phase6`.

### QA Setup

- **Engine:** Playwright v1.61.1 on Chromium (headless true)
- **Test File:** `tests/phase-6-checkout-ux.spec.ts`
- **Auth State:** Saved from `$QA_CUSTOMER_EMAIL` / `$QA_CUSTOMER_PASSWORD` environment variables
- **Database Seed:** `tests/qa-seed.js` applied before each test run
- **Proof date:** 2026-07-04

### Quick Verification Matrix

| Screenshot | Feature | Verification Success |
|------------|---------|----------------------|
| `01-serviceability.png` | Serviceable address shows catalog | Banner text "Serviceable" visible, Aagam Grocery Store displayed |
| `02-search-results.png` | Search filters products | Search "milk" returns Milk product with updated count |
| `03-category-filter.png` | Category dropdown filters | Non-All category selection shows filtered product count |
| `04-cart-quote.png` | Add to cart and show quote | Add button works, Bill Details subtotal, delivery fee, and total displayed |
| `05-order-created.png` | Place COD order | COD order created, cart clears, success message with order ID |
| `06-substitutes.png` | Out-of-stock substitutes | Out item shows Substitutes button and replacement option |

### Detailed Test Execution Results

1. **[setup]** `login as customer and save auth state`
   - Status: **PASSED**
   - Purpose: Save authenticated customer session for repeatable tests

2. **[chromium]** `01-serviceability: address selector shows serviceable banner`
   - Status: **PASSED**
   - Endpoint: `GET /checkout/serviceability?addressId=...`
   - Expected: Banner text "Serviceable" and store name "Aagam Grocery Store"

3. **[chromium]** `02-search-results: search filters products`
   - Status: **PASSED**
   - Endpoint: `GET /products?search=milk`
   - Expected: Product name "Milk" appears in UI, count updated

4. **[chromium]** `03-category-filter: category dropdown filters products`
   - Status: **PASSED**
   - Expected: Non-All category selection shows filtered product count

5. **[chromium]** `04-cart-quote: add item to cart shows quote with bill details`
   - Status: **PASSED**
   - Endpoint: `GET /products?includeAvailability=true` and `POST /checkout/quote`
   - Expected: quote visible with subtotal, delivery fee, ETA, and total

6. **[chromium]** `05-order-created: place COD order clears cart and shows success`
   - Status: **PASSED**
   - Endpoint: `POST /checkout/place-order`
   - Expected: Order created with ID, cart cleared, empty-cart message visible

7. **[chromium]** `06-substitutes: out-of-stock product shows substitute options`
   - Status: **PASSED**
   - Endpoint: `GET /products/:id/substitutes`
   - Expected: Out-of-stock indicator, Substitutes button, and at least one Replace button visible

### Key Assumptions & Test Context

- **Test Database:** seeded test environment with deterministic Phase 6 state
- **Customer Account:**
  - Email: `$QA_CUSTOMER_EMAIL` env var
  - Password: `$QA_CUSTOMER_PASSWORD` env var; never committed
  - Role: CUSTOMER
  - Default address: Ahmedabad Home, serviceable
- **Product Availability:** core products have availability data for Ahmedabad service area
- **Environment:**
  - API Gateway: `http://localhost:3005`
  - Admin Dashboard: `http://localhost:3001`

### Screenshot References

All screenshots are committed locally in `docs/qa/phase-6/`:

| File | Feature |
|------|---------|
| `01-serviceability.png` | Serviceable address shows catalog |
| `02-search-results.png` | Search filters products |
| `03-category-filter.png` | Category dropdown filters |
| `04-cart-quote.png` | Add to cart and show quote |
| `05-order-created.png` | Place COD order |
| `06-substitutes.png` | Out-of-stock substitutes |

---

## Phase 6 Final Acceptance Note

- **Accepted commit SHA:** `20237c4dc7f9cf43d932380464c85f45050ae88f`
- **Proof date:** 2026-07-04
- **Setup file:** `tests/phase-6-checkout-ux.setup.ts` reads credentials from `QA_CUSTOMER_EMAIL` / `QA_CUSTOMER_PASSWORD` env vars and throws if missing.

### Playwright result

6/6 tests passed. Test 06 strictly asserts the out-of-stock indicator, the Substitutes button, and at least one Replace button. There is no silent conditional pass.

### What is real vs mocked

- **Real:** serviceability endpoint, product search, category filter, cart/quote API, order placement API, substitutes endpoint, committed screenshots.
- **Mocked:** none in the browser flow. Tests run against seeded local services.

### Known limitations

- No GitHub Actions workflow run attached to the accepted commit yet; proof is based on local Playwright execution.
- Substitutes test depends on the seed having at least one out-of-stock product for the Ahmedabad address; seed drift will break it.

### Acceptance

Phase 6 Shopping UX is accepted for the current project checkpoint.
