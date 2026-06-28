# Phase 1 — Security, Tenancy, Soft Delete, Inventory Foundation

**Date:** 2026-06-28
**Branch:** `phase-1-security-inventory-foundation`
**Base commit:** `9613392b92348d0bd0cc7bc9d1c14292160588c2`
**Final commit:** `9f6960b`
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

**File:** `stores/store.service.ts:110`

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

| Method | Change |
|--------|--------|
| `ProductService.findAll()` | `where: { deletedAt: null }` |
| `ProductService.findOne()` | `where: { id, deletedAt: null }` |
| `ProductService.delete()` | `update({ deletedAt: new Date(), isActive: false })` instead of hard delete |
| `StoreService.findAll()` | `where: { deletedAt: null }` |
| `StoreService.findByOwnerId()` | `where: { ownerId, deletedAt: null }` |
| `StoreService.delete()` | `update({ deletedAt: new Date(), isActive: false })` instead of hard delete |
| `ProductService.resolveAvailabilityContext()` | `where: { isActive: true, deletedAt: null }` |

**Test proof:** Soft-deleted product excluded from `findAll()`; soft-deleted store excluded from `findAll()`; historical orders preserved after store soft delete.

---

## 5. Inventory Ledger Integration

| Event | Reason | Where |
|-------|--------|-------|
| Admin/store-owner manually updates stock | `MANUAL_ADJUSTMENT` | `store.service.ts:updateInventory` (inside `$transaction`) |
| Customer places order (inventory decrement) | `CHECKOUT_RESERVATION` | `checkout.service.ts:placeOrder` (inside `$transaction`, linked to orderId after creation) |
| Customer cancels order (inventory restore) | `ORDER_CANCEL_RESTORE` | `order.service.ts:cancelMyOrder` (inside `$transaction`) |
| Order marked DELIVERED | `ORDER_DELIVERED_FINALIZE` | `order.service.ts:updateStatus` (inside `$transaction`) |

**Test proof:** Manual inventory update creates `MANUAL_ADJUSTMENT` ledger entry with correct `previousQuantity`, `newQuantity`, `quantityDelta`, `actorUserId`.

---

## 6. Tests

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

Phase 1: Cancellation Inventory Restore and Ledger
  ✓ Cancellation should restore inventory and create ledger entry
```

---

## 7. Commands Run

| Command | Result |
|---------|--------|
| `npm run build --workspace=apps/api-gateway` | ✅ Pass |
| `npm test --workspace=apps/api-gateway` | ✅ 12/12 pass |
| `npx prisma generate --schema packages/database/prisma/schema.prisma` | ✅ Pass |
| `npx prisma db execute --file .../migration.sql` | ✅ Pass |
| `git push origin phase-1-security-inventory-foundation` | ✅ Pass |

---

## 8. GitHub Actions Proof

Branch pushed to: `https://github.com/Saikumar-bali/AAGAM_E-commerce/tree/phase-1-security-inventory-foundation`

**Note:** GitHub Actions workflows may not be configured in this repository. The branch is available for CI/CD verification when workflows are added.

---

## 9. What This Phase Explicitly Excludes

- Payment gateway integration
- Coupons / loyalty / rewards
- Rider earnings / payouts
- Support ticketing system
- Analytics dashboards
- UI redesign or theming changes
- Push notification for cancellation
- Refund processing

---

## 10. Files Changed

| File | Summary |
|------|---------|
| `packages/database/prisma/schema.prisma` | Added `deletedAt` to Store/Product, `isActive` to Product, `InventoryLedger` model + enum |
| `packages/database/prisma/migrations/20260628000000_phase1_security_inventory/migration.sql` | Migration SQL |
| `apps/api-gateway/src/auth/auth.controller.ts` | Added guards to `GET /auth/users` |
| `apps/api-gateway/src/riders/rider.controller.ts` | Added `RolesGuard` to `GET /riders/:id` and `PATCH /riders/:id/status` |
| `apps/api-gateway/src/upload/upload.controller.ts` | Added class-level `JwtAuthGuard` + `RolesGuard` with `@Roles(ADMIN, STORE_OWNER)` |
| `apps/api-gateway/src/stores/store.controller.ts` | Pass `req.user` to `updateInventory` |
| `apps/api-gateway/src/stores/store.service.ts` | Tenancy check, soft delete, ledger in `$transaction` |
| `apps/api-gateway/src/products/product.service.ts` | Soft delete filters, soft delete method |
| `apps/api-gateway/src/orders/order.service.ts` | Ledger on cancel and delivery |
| `apps/api-gateway/src/checkout/checkout.service.ts` | Ledger on checkout reservation, orderId linking |
| `apps/api-gateway/src/inventory.spec.ts` | 12 tests (RBAC, soft delete, tenancy, ledger, checkout, cancel) |
| `apps/api-gateway/jest.config.js` | Jest config |
| `apps/api-gateway/package.json` | Added test script, devDependencies |
| `apps/api-gateway/tsconfig.json` | Excluded spec files from build |

---

## 11. Known Limitations

- **GitHub Actions:** No CI/CD workflows are configured in the repository. The branch is ready for review but automated checks are not available.
- **Checkout test:** The checkout inventory/ledger test uses direct Prisma calls to simulate the flow rather than calling `CheckoutService.placeOrder()` directly (requires mocking `TrackingGateway` and `NotificationService`).
- **No E2E tests:** RBAC tests are HTTP-level integration tests using `node-fetch` against the running API server.
