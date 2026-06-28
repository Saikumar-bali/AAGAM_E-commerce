# Phase 1 — Security, Tenancy, Soft Delete, Inventory Foundation

**Date:** 2026-06-28
**Branch:** `phase-1-security-inventory-foundation`
**Base commit:** `9613392b92348d0bd0cc7bc9d1c14292160588c2`
**Final commit:** `44d7b9f`
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

**Prisma Client regenerated.** Verified `npx prisma generate` succeeds.

---

## 2. RBAC Guard Fixes

| Route | Before | After | File |
|-------|--------|-------|------|
| `GET /auth/users` | `@Roles(ADMIN)` but **no guards** | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN)` | `auth.controller.ts:102` |
| `GET /riders/:id` | `JwtAuthGuard` only | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN)` | `rider.controller.ts:37` |
| `PATCH /riders/:id/status` | `JwtAuthGuard` only | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN)` | `rider.controller.ts:43` |
| `POST /upload/image` | **No guards at all** | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN, STORE_OWNER)` at class level | `upload.controller.ts:10` |

**API proof (masked tokens):**
```
GET /auth/users without token → 401
GET /auth/users with customer token (***@aagam.com) → 403
GET /auth/users with admin token (***@aagam.com) → 200
POST /upload/image without token → 401
```

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
  // ... upsert + ledger
}
```

**Test proof:** Store-owner for Store A cannot update inventory for Store B → throws `ForbiddenException`.

---

## 4. Soft Delete

| Method | Filter |
|--------|--------|
| `ProductService.findAll()` | `{ deletedAt: null, isActive: true }` |
| `ProductService.findOne()` | `{ id, deletedAt: null, isActive: true }` |
| `ProductService.delete()` | `update({ deletedAt: new Date(), isActive: false })` |
| `StoreService.findAll()` | `{ deletedAt: null, isActive: true }` |
| `StoreService.findByOwnerId()` | `{ ownerId, deletedAt: null }` |
| `StoreService.findOne()` | `{ id, deletedAt: null, isActive: true }` — throws `NotFoundException` if not found |
| `StoreService.delete()` | `update({ deletedAt: new Date(), isActive: false })` |

**Test proof:** Soft-deleted product excluded from `findAll()`; soft-deleted store excluded from `findAll()`; historical orders preserved after store soft delete.

---

## 5. Checkout Guards (Inactive/Deleted Rejection)

| Location | Filter Added |
|----------|-------------|
| `CheckoutService.resolveStoreForLocation()` | `isActive: true, deletedAt: null` |
| `CheckoutService.quote()` product lookup | `deletedAt: null, isActive: true` |
| `CheckoutService.quote()` fallback store | `isActive: true, deletedAt: null` |

**Result:** Requesting inactive/deleted products returns `BadRequestException: Missing or unavailable products`.

---

## 6. Inventory Ledger Integration

| Event | Reason | Where |
|-------|--------|-------|
| Admin/store-owner manually updates stock | `MANUAL_ADJUSTMENT` | `store.service.ts:updateInventory` (inside `$transaction`) |
| Customer places order (inventory decrement) | `CHECKOUT_RESERVATION` | `checkout.service.ts:placeOrder` (inside `$transaction`, linked to orderId after creation) |
| Customer cancels order (inventory restore) | `ORDER_CANCEL_RESTORE` | `order.service.ts:cancelMyOrder` (inside `$transaction`) |
| Order marked DELIVERED | `ORDER_DELIVERED_FINALIZE` | `order.service.ts:updateStatus` (inside `$transaction`) |

---

## 7. Tests

**File:** `apps/api-gateway/src/inventory.spec.ts`
**Framework:** Jest + ts-jest (12/12 passing)

```
Phase 1: RBAC Guards
  ✓ GET /auth/users should require authentication (no token = rejected)
  ✓ GET /riders/:id should require admin role (customer token = rejected)
  ✓ GET /upload/image should require authentication

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
    (calls CheckoutService.placeOrder() with mocked TrackingGateway/NotificationService)
    (verifies: order created, inventory decremented, ledger.orderId matches, delta correct)

Phase 1: Cancellation Inventory Restore and Ledger
  ✓ Cancellation should restore inventory and create ledger entry
```

---

## 8. CI / GitHub Actions

**Workflow:** `.github/workflows/ci.yml`
**Change:** Updated push trigger to include `phase-*` branches; added test step.

```yaml
on:
  push:
    branches: ["main", "phase-*"]
  pull_request:
    branches: ["main"]
```

**CI Run:** Triggered by push to `phase-1-security-inventory-foundation` (SHA `44d7b9f`).
**Status:** The push to the `phase-*` branch triggers the CI workflow automatically per the updated trigger config. The workflow runs `npx turbo build` and `npm test --workspace=apps/api-gateway`.

**Note:** `gh` CLI is not authenticated on this machine, so a PR could not be created via CLI. The CI workflow triggers on direct push to `phase-*` branches, which was already done.

---

## 9. Commands Run

| Command | Result |
|---------|--------|
| `npm run build --workspace=apps/api-gateway` | ✅ Pass |
| `npm test --workspace=apps/api-gateway` | ✅ 12/12 pass |
| `npx prisma generate --schema packages/database/prisma/schema.prisma` | ✅ Pass |
| `npx prisma db execute --file .../migration.sql` | ✅ Pass |
| `npx turbo build` | ✅ 7/7 tasks pass |
| `git push origin phase-1-security-inventory-foundation` | ✅ Pass |

---

## 10. Files Changed

| File | Summary |
|------|---------|
| `.github/workflows/ci.yml` | Added `phase-*` push trigger, added test step |
| `packages/database/prisma/schema.prisma` | `deletedAt` on Store/Product, `isActive` on Product, `InventoryLedger` model |
| `packages/database/prisma/migrations/20260628000000_phase1_security_inventory/migration.sql` | Migration SQL |
| `apps/api-gateway/src/auth/auth.controller.ts` | Guards on `GET /auth/users` |
| `apps/api-gateway/src/riders/rider.controller.ts` | `RolesGuard` on `GET /riders/:id`, `PATCH /riders/:id/status` |
| `apps/api-gateway/src/upload/upload.controller.ts` | Class-level `JwtAuthGuard` + `RolesGuard` |
| `apps/api-gateway/src/stores/store.controller.ts` | Pass `req.user` to `updateInventory` |
| `apps/api-gateway/src/stores/store.service.ts` | Tenancy check, soft delete, `isActive` filter, `findOne` throws on deleted/inactive |
| `apps/api-gateway/src/products/product.service.ts` | `isActive: true` in `findAll`/`findOne`, soft delete |
| `apps/api-gateway/src/orders/order.service.ts` | Ledger on cancel and delivery |
| `apps/api-gateway/src/checkout/checkout.service.ts` | Ledger on checkout, `isActive`+`deletedAt` filter on products and stores |
| `apps/api-gateway/src/inventory.spec.ts` | 12 tests including CheckoutService.placeOrder() integration |
| `apps/api-gateway/jest.config.js` | Jest config |
| `apps/api-gateway/package.json` | Test script, devDependencies |
| `apps/api-gateway/tsconfig.json` | Excluded spec files from build |

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

- **GitHub CLI auth:** `gh` is installed but not authenticated, so a PR could not be created via CLI. The CI workflow triggers on direct push to `phase-*` branches.
- **Checkout test store resolution:** Uses unique coordinates (`88.888, 88.888`) to ensure `resolveStoreForLocation` picks the test store.
- **No E2E tests:** RBAC tests are HTTP-level integration tests against a running API server.
