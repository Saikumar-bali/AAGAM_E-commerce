# Phase 6 Catalog Search Cart Serviceability UX Proof

## Branch

phase-6-catalog-search-cart-serviceability-ux

## Base

main after Phase 5 merge.

## Scope of this direct push

Initial backend foundation only. This is a checkpoint for local validation, not final Phase 6 acceptance.

## Files changed

- apps/api-gateway/src/products/dto/query-products.dto.ts
- apps/api-gateway/src/products/product.service.ts
- apps/api-gateway/src/products/product.controller.ts
- apps/api-gateway/src/checkout/checkout.service.ts
- apps/api-gateway/src/checkout/checkout.controller.ts
- apps/api-gateway/src/phase6-catalog.spec.ts
- apps/api-gateway/package.json
- docs/PHASE_6_CATALOG_SEARCH_CART_SERVICEABILITY_UX.md
- docs/ai-runs/2026-07-03_phase-6-catalog-search-cart-serviceability-ux.md

## Backend changes

Serviceability endpoint added:

GET /checkout/serviceability?addressId=<addressId>

It returns selected address, nearest active store, distance, delivery fee, delivery fee paise, and ETA minutes.

Product query now supports storeId in addition to existing search/category/address/lat/lng availability context.

Substitutes endpoint added:

GET /products/:id/substitutes?storeId=<storeId>

Substitute rules:

- same category
- excludes current product
- excludes inactive products
- excludes soft-deleted products
- excludes out-of-stock products
- deterministic name sort
- max 8 results

Checkout quote now includes etaMinutes and pricing snapshot includes ETA/distance context.

## Tests added

Added apps/api-gateway/src/phase6-catalog.spec.ts.

Expected coverage:

1. serviceable address returns nearest active store, delivery fee, and ETA
2. non-serviceable address is reported before checkout
3. catalog search excludes inactive/deleted products and attaches stock state
4. substitutes are same-category, active, not deleted, and in-stock only
5. quote exposes unavailable item and placeOrder blocks it

Updated apps/api-gateway/package.json so test:ci includes phase6-catalog.spec.ts.

## CI status

Pending GitHub Actions after push.

## What is real

- Backend serviceability logic
- Prisma-backed catalog/stock/substitute tests
- checkout quote stock behavior
- order placement block for unavailable cart item

## What is not completed yet

- customer web cart UX polish
- customer mobile UX polish
- Phase 6 screenshots
- Phase 6 Playwright shopping flow
- substitute replacement UI
- non-serviceable UI state

## Local validation commands

```bash
git fetch origin
git checkout phase-6-catalog-search-cart-serviceability-ux
git pull origin phase-6-catalog-search-cart-serviceability-ux
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npx prisma migrate status --schema=packages/database/prisma/schema.prisma
npm run test:ci --workspace=apps/api-gateway
npx turbo build --force
```
