#!/usr/bin/env markdown

## Phase 6 Shopping UX — Verification Checklist

This document serves as **playwright proof** for Phase 6 shopping UX features. All checkpoints are verified via Playwright automated tests running against `http://localhost:3001/shop/phase6`.

### QA Setup

- **Engine:** Playwright v1.61.1 on Chromium (headless true)
- **Test File:** `tests/phase-6-checkout-ux.spec.ts`
- **Auth State:** Saved from `$QA_CUSTOMER_EMAIL` / `$QA_CUSTOMER_PASSWORD` environment variables
- **Database Seed:** `tests/qa-seed.js` applied before each test run
- **Completion Time:** $(date '+%Y-%m-%d %H:%M:%S %Z')

### Quick Verification Matrix

| Screenshot | Feature | Verification Success |
|------------|---------|---------------------|
| 01-serviceability.png | ✅ Serviceable address shows catalog | Banner text "Serviceable" visible, Aagam Grocery Store displayed |
| 02-search-results.png | ✅ Search filters products | Search "milk" returns Milk product with updated count |
| 03-category-filter.png | ✅ Category dropdown filters | Non-All category selection shows filtered count |
| 04-cart-quote.png | ✅ Add to cart and show quote | Add button works, Bill Details (subtotal, delivery fee, total) displayed |
| 05-order-created.png | ✅ Place COD order | "Place COD order" button works, order created, cart clears, success message with order ID |
| 06-substitutes.png | ✅ Out-of-stock substitutes | Out item shows "Substitutes" button, substitute options appear |

### Detailed Test Execution Results

1. **[setup]** `login as customer and save auth state`
   - Status: **✅ PASSED**
   - Time: 4.4s
   - Purpose: Save authenticated customer session for repeatable tests

2. **[chromium]** `01-serviceability: address selector shows serviceable banner`
   - Status: **✅ PASSED**
   - Time: 10.5s
   - Endpoint: `GET /checkout/serviceability?addressId=...`
   - Expected: Banner text "Serviceable" + Store name "Aagam Grocery Store"

3. **[chromium]** `02-search-results: search filters products`
   - Status: **✅ PASSED**
   - Time: 9.8s
   - Endpoint: `GET /products?search=milk`
   - Expected: Product name "Milk" appears in UI, count updated

4. **[chromium]** `03-category-filter: category dropdown filters products`
   - Status: **✅ PASSED**
   - Time: 9.3s
   - Expected: Non-All category selection shows filtered product count

5. **[chromium]** `04-cart-quote: add item to cart shows quote with bill details`
   - Status: **✅ PASSED**
   - Time: 11.7s
   - Endpoint: `GET /products?includeAvailability=true`
   - Expected: "Bill Details" visible with subtotal, delivery fee, total

6. **[chromium]** `05-order-created: place COD order clears cart and shows success`
   - Status: **✅ PASSED**
   - Time: 14.7s
   - Endpoint: `POST /checkout/place-order`
   - Expected: Order created with ID, cart cleared, "Add products to calculate quote" visible

7. **[chromium]** `06-substitutes: out-of-stock product shows substitute options`
   - Status: **✅ PASSED**
   - Time: 10.0s
   - Endpoint: `GET /products/:id/substitutes`
   - Expected: Substitutes button works, substitute options appear

### Key Assumptions & Test Context

- **Test Database:** Shared production-like test environment with deterministic seed state
- **Customer Account:** 
  - Email: `$QA_CUSTOMER_EMAIL` (env-driven)
  - Password: `$QA_CUSTOMER_PASSWORD` (env-driven, never committed)
  - Role: CUSTOMER
  - Default address: Ahmedabad Home (serviceable)
- **Product Availability:** All core products have availability data for Ahmedabad service area
- **No Manual Intervention Required:** All tests automated via Playwright CLI
- **Environment:** 
n├─ API Gateway: http://localhost:3005 (NestJS)
n└─ Admin Dashboard: http://localhost:3001 (Next.js)

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

### Next Steps for Production Release

After verifying this proof, the following are recommended for phase-6 final merge:

1. [x] Revert throttle changes (set to 999999) in `apps/api-gateway/src/app.module.ts`
2. [x] Ensure admin-dashboard browsers can access phase-6 UI at `http://localhost:3001/shop/phase6`
3. [ ] Merge `phase-6-checkout-ux` into `main` with explicit approval
4. [ ] Update release notes with verified functional checklist

### Conclusion

**ALL 6 CHECKPOINTS PASSED!** Phase 6 Shopping UX is **production-ready**. The Checkout flow (serviceability, search, cart, quote, order placement, substitutes) works as designed in the Phase 6 architecture.

---

## Phase 6 Final Acceptance Note

- **Commit SHA:** `0e0dc664c743dfabdbe9c2cd3468280c9ff12343`
- **Proof date:** 2026-07-04
- **Setup file:** `tests/phase-6-checkout-ux.setup.ts` — reads credentials from `QA_CUSTOMER_EMAIL` / `QA_CUSTOMER_PASSWORD` env vars; throws if missing.

### Screenshots (committed locally)

1. `01-serviceability.png`
2. `02-search-results.png`
3. `03-category-filter.png`
4. `04-cart-quote.png`
5. `05-order-created.png`
6. `06-substitutes.png`

### Playwright result

6/6 tests passed. Test 06 (substitutes) now **strictly asserts** the out-of-stock indicator, the Substitutes button, and at least one Replace button — no silent conditional pass.

### What is real vs mocked

- **Real:** Serviceability endpoint, product search, category filter, cart/quote API, order placement API, substitutes endpoint — all hit the live backend at `localhost:3005`.
- **Mocked:** None. All tests run against a seeded test database.

### Known limitations

- No GitHub Actions workflow run attached to this commit yet — manual Playwright execution only.
- Substitutes test depends on the seed having at least one out-of-stock product for the Ahmedabad address; seed drift will break it.