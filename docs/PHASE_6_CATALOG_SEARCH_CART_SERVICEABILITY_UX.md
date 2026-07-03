# Phase 6 — Catalog, Search, Cart, Serviceability, Substitutes, Quick-Commerce UX

## Status

Initial backend foundation pushed directly to GitHub for local validation.

This is not the full Phase 6 completion yet. This checkpoint focuses on safe backend APIs and CI-safe tests before deeper customer UI work.

## Goal

Make customer shopping behave like a quick-commerce flow:

1. Select/check address serviceability.
2. Browse/search products.
3. See stock-aware catalog availability.
4. Quote cart/order with delivery fee and ETA.
5. Block checkout for non-serviceable or unavailable products.
6. Show deterministic substitutes for out-of-stock products.

## Backend additions

### Checkout serviceability

Endpoint:

```http
GET /checkout/serviceability?addressId=<addressId>
```

Customer-only endpoint using the authenticated customer.

Returns:

- `serviceable`
- selected address summary
- nearest active store
- `distanceKm`
- `deliveryFee`
- `deliveryFeePaise`
- `etaMinutes`

The serviceability threshold remains aligned with checkout quote logic:

- `<= 3 km`: serviceable, ₹19 fee
- `<= 6 km`: serviceable, ₹29 fee
- `<= 8 km`: serviceable, ₹49 fee
- `> 8 km`: not serviceable

### Catalog availability

Product query DTO now supports:

- `search`
- `categoryId`
- `sort`
- `page`
- `pageSize`
- `addressId`
- `storeId`
- `lat`
- `lng`
- `includeAvailability`

Availability can be resolved from a selected address, explicit store, or coordinates.

Products continue to exclude:

- inactive products
- soft-deleted products

Availability includes:

- `storeId`
- `storeName`
- `availableQty`
- `inStock`
- `serviceable`
- `distanceKm`

### Substitute suggestions

Endpoint:

```http
GET /products/:id/substitutes?storeId=<storeId>
```

Also supports address/coordinate-driven context using the same product query DTO.

Rules:

- same category only
- exclude current product
- exclude inactive products
- exclude soft-deleted products
- exclude out-of-stock products
- return deterministic name-sorted results
- maximum 8 substitutes

## Checkout quote polish

Quote now returns `etaMinutes` along with:

- serviceability
- nearest store
- distance
- stock state per item
- subtotal
- delivery fee
- grand total
- paise totals

`placeOrder` keeps Phase 2 money correctness and still blocks:

- non-serviceable address
- out-of-stock products
- insufficient inventory during reservation

The pricing snapshot now stores ETA and distance metadata for audit context.

## Tests

Added:

```text
apps/api-gateway/src/phase6-catalog.spec.ts
```

CI-safe test coverage:

1. serviceable address returns nearest active store, delivery fee, and ETA
2. non-serviceable address is reported before checkout
3. catalog search excludes inactive/deleted products and attaches stock state
4. substitutes are same-category, active, not deleted, and in-stock only
5. quote exposes unavailable item and placeOrder blocks it

`apps/api-gateway/package.json` test:ci now includes `phase6-catalog.spec.ts`.

## What is real

- Prisma-backed test data
- checkout serviceability calculation
- stock-aware catalog availability
- substitute filtering against real inventory
- checkout quote out-of-stock behavior
- order placement stock block

## What is still pending in Phase 6

- customer web UI cart polish
- customer mobile catalog/cart parity
- committed Phase 6 screenshots
- Playwright shopping-flow proof
- cart persistence polish
- substitute replacement in UI
- non-serviceable customer UI state

## Local test commands

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
