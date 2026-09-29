# Phase 1 — Security, Tenancy, Soft Delete, Inventory Foundation

**Date:** 2026-06-28
**Branch:** `phase-1-security-inventory-foundation`
**Base commit:** `9613392b92348d0bd0cc7bc9d1c14292160588c2`
**Final commit:** `2fd95dc7ec906ffe46ef434fbf7094a912b2d469`
**GitHub PR:** https://github.com/Saikumar-bali/AAGAM_E-commerce/pull/new/phase-1-security-inventory-foundation

---

## 1. Schema Changes

**Migration:** `20260628000000_phase1_security_inventory`
**Command:** `npx prisma db execute --file packages/database/prisma/migrations/20260628000000_phase1_security_inventory/migration.sql`

| Change | Table | Details |
|--------|-------|---------|
| Soft delete | `Store` | Added `deletedAt DateTime?` |
| Soft delete | `Product` | Added `deletedAt DateTime?`, `isActive Boolean @default(true)` |
| Audit ledger | `InventoryLedger` | New table with `storeId`, `productId`, `orderId`, `reason`, `quantityDelta`, `previousQuantity`, `newQuantity`, `actorUserId`, `note` |
| Enum | `InventoryAdjustmentReason` | `MANUAL_ADJUSTMENT`, `CHECKOUT_RESERVATION`, `ORDER_CANCEL_RESTORE`, `ORDER_DELIVERED_FINALIZE`, `STOCK_CORRECTION` |

---

## 2. RBAC Guard Fixes

| Route | Before | After | File |
|-------|--------|-------|------|
| `GET /auth/users` | `@Roles(ADMIN)` but **no guards** | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN)` | `auth.controller.ts:102` |
| `GET /riders/:id` | `JwtAuthGuard` only | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN)` | `rider.controller.ts:37` |
| `PATCH /riders/:id/status` | `JwtAuthGuard` only | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN)` | `rider.controller.ts:43` |
| `POST /upload/image` | **No guards at all** | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN, STORE_OWNER)` at class level | `upload.controller.ts:10` |

**Manual API proof (local only):**
```
GET /auth/users without token → 401
GET /auth/users with customer token (***@aagam.com) → 403
GET /auth/users with admin token (***@aagam.com) → 200
POST /upload/image without token → 401
```
These are in `api-smoke.spec.ts` and require a running API server.

---

## 3. Store-Owner Tenancy

**File:** `stores/store.service.ts:94`

```typescript
async updateInventory(storeId, productId, quantity, actor?) {
  if (actor?.role === Role.STORE_OWNER) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (store.ownerId !== actor.id) {
      throw new ForbiddenException('You can only update inventory for your own stores');
    }
  }
}
```

---

## 4. Soft Delete & Public Filtering

| Method | Filter |
|--------|--------|
| `ProductService.findAll()` | `{ deletedAt: null, isActive: true }` |
| `ProductService.findOne()` | `{ id, deletedAt: null, isActive: true }` — throws NotFoundException |
| `ProductService.delete()` | `update({ deletedAt: new Date(), isActive: false })` |
| `StoreService.findAll()` | `{ deletedAt: null, isActive: true }` |
| `StoreService.findOne()` | `{ id, deletedAt: null, isActive: true }` — throws NotFoundException |
| `StoreService.delete()` | `update({ deletedAt: new Date(), isActive: false })` |

---

## 5. Checkout Guards (Inactive/Deleted Rejection)

| Location | Filter Added |
|----------|-------------|
| `CheckoutService.resolveStoreForLocation()` | `isActive: true, deletedAt: null` |
| `CheckoutService.quote()` product lookup | `deletedAt: null, isActive: true` |
| `CheckoutService.quote()` fallback store | `isActive: true, deletedAt: null` |

---

## 6. Inventory Ledger Integration

| Event | Reason | Where |
|-------|--------|-------|
| Manual stock update | `MANUAL_ADJUSTMENT` | `store.service.ts:updateInventory` |
| Checkout reservation | `CHECKOUT_RESERVATION` | `checkout.service.ts:placeOrder` |
| Order cancellation restore | `ORDER_CANCEL_RESTORE` | `order.service.ts:cancelMyOrder` |
| Order delivered finalize | `ORDER_DELIVERED_FINALIZE` | `order.service.ts:updateStatus` |

---

## 7. Test Split

### CI-Safe Tests (`inventory.spec.ts` — 9 tests)

Run in CI with `npm run test:ci`. Uses Prisma directly against a Postgres database.

```
Phase 1: Soft Delete
  ✓ Soft-deleted product should not appear in findAll
  ✓ Soft-deleted store should not appear in store findAll

Phase 1: Store Tenancy
  ✓ Store-owner cannot update inventory of another owners store
  ✓ Admin can update any store inventory

Phase 1: Inventory Ledger
  ✓ Manual inventory update should create ledger entry
  ✓ Second manual update should log correct delta

Phase 1: Store Soft Delete Preserves Orders
  ✓ Soft-deleted store should still have historical orders

Phase 1: Checkout Inventory and Ledger
  ✓ Checkout should decrement inventory and create ledger entry

Phase 1: Cancellation Inventory Restore and Ledger
  ✓ Cancellation should restore inventory and create ledger entry
```

### Manual Smoke Tests (`api-smoke.spec.ts` — 3 tests)

Run locally with `npm run test:api-smoke`. Requires running API server on `localhost:3005`.

```
Phase 1: RBAC API Smoke Tests (manual)
  ✓ GET /auth/users should require authentication
  ✓ GET /riders/:id should require admin role
  ✓ GET /upload/image should require authentication
```

---

## 8. CI / GitHub Actions

**Workflow:** `.github/workflows/ci.yml`

### Configuration

- **Trigger:** Push to `main` or `phase-*` branches, PRs to `main`
- **Jobs:**
  1. `build` — Installs deps, runs `npx turbo build`
  2. `test` — Runs after `build`, with Postgres 16 service, runs `npm run test:ci`

### CI Architecture

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: aagam_ecom_test

steps:
  - npm install
  - prisma generate
  - turbo build --force
  - (test job) prisma db push
  - (test job) Build @aagam/types, @aagam/utils, @aagam/database
  - (test job) Run CI-safe tests (service-level, no HTTP calls)
```

### CI Run

- **Triggered by:** Push to `phase-1-security-inventory-foundation` (SHA `2fd95dc7ec906ffe46ef434fbf7094a912b2d469`)
- **Run URL:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28323184184
- **Status:** ✅ **PASSED** — Build job passed, Service Tests job passed (9/9 tests)

---

## 9. Commands Run Locally

| Command | Result |
|---------|--------|
| `npm run build --workspace=apps/api-gateway` | ✅ Pass |
| `npm run test:ci --workspace=apps/api-gateway` | ✅ 9/9 pass |
| `npm run test:api-smoke --workspace=apps/api-gateway` | ✅ 3/3 pass (requires running server) |
| `npx prisma generate` | ✅ Pass |
| `npx turbo build` | ✅ 7/7 tasks pass |
| `git push origin phase-1-security-inventory-foundation` | ✅ Pass |

---

## 10. Files Changed

| File | Summary |
|------|---------|
| `.github/workflows/ci.yml` | Postgres service, `test:ci` script, prisma generate + db push, turbo --force |
| `apps/api-gateway/src/inventory.spec.ts` | CI-safe tests only (9 tests, no HTTP calls) |
| `apps/api-gateway/src/api-smoke.spec.ts` | Manual RBAC smoke tests (3 tests, requires server) |
| `apps/api-gateway/package.json` | Added `test:ci` and `test:api-smoke` scripts |
| `apps/api-gateway/src/auth/auth.service.ts` | Added `updateProfile` method (was uncommitted, caused TS2339) |
| `apps/api-gateway/src/products/product.service.ts` | `isActive: true` in `findAll`/`findOne` |
| `apps/api-gateway/src/stores/store.service.ts` | `isActive: true` in `findAll`, `findOne` rejects deleted/inactive |
| `apps/api-gateway/src/checkout/checkout.service.ts` | Product/store filters for inactive/deleted |
| `apps/api-gateway/src/auth/auth.controller.ts` | Guards on `GET /auth/users` |
| `apps/api-gateway/src/riders/rider.controller.ts` | `RolesGuard` on rider routes |
| `apps/api-gateway/src/upload/upload.controller.ts` | Class-level guards |
| `apps/api-gateway/src/stores/store.controller.ts` | Pass `req.user` to `updateInventory` |
| `apps/api-gateway/src/orders/order.service.ts` | Ledger on cancel and delivery |
| `apps/admin-dashboard/src/components/DashboardLayout.tsx` | STORE_OWNER role support |
| `apps/admin-dashboard/src/app/(store)/store/*/page.tsx` | Store owner dashboard pages |
| `packages/database/prisma/schema.prisma` | Schema changes |
| `packages/database/prisma/migrations/20260628000000_phase1_security_inventory/migration.sql` | Migration |
| `packages/database/seed.js` | Fixed store owner email to `store@aagam.com` |
| `apps/api-gateway/jest.config.js` | Jest config |
| `apps/api-gateway/tsconfig.json` | Excluded spec files |

---

## 11. What This Phase Explicitly Excludes

- Payment gateway integration
- Coupons / loyalty / rewards
- Rider earnings / payouts
- Support ticketing system
- Analytics dashboards
- UI redesign or theming changes
- Refund processing

---

## 12. Known Limitations

- **API smoke tests:** The 3 RBAC tests in `api-smoke.spec.ts` require a running API server on `localhost:3005` and are not included in CI.
- **Checkout test store resolution:** Uses unique coordinates (`88.888, 88.888`) to ensure `resolveStoreForLocation` picks the test store.
- **Migration drift resolved:** See Phase 1.1 (`docs/ai-runs/2026-06-28_phase-1-1-database-migration-release-safety.md`). CI now uses `prisma migrate deploy` and the migration gap has been closed.
