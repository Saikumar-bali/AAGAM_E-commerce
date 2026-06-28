# Phase 1 — Security, Tenancy, Soft Delete, Inventory Foundation

**Date:** 2026-06-28
**Branch:** `phase-1-security-inventory-foundation`
**Base:** `architect-phase-1-security-inventory-plan`
**Commit:** `01ac986`

---

## 1. Schema Changes

**Migration:** `20260628000000_phase1_security_inventory`

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

**Smoke test proof:**
- `GET /auth/users` without token → 401
- `GET /auth/users` with customer token → 403
- `GET /auth/users` with admin token → 200
- `POST /upload/image` without token → 401

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

**Test proof:** Soft-deleted product excluded from `findAll()`; soft-deleted store excluded from `findAll()`.

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
**Framework:** Jest + ts-jest (9/9 passing)

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
```

---

## 7. What This Phase Explicitly Excludes

- Payment gateway integration
- Coupons / loyalty / rewards
- Rider earnings / payouts
- Support ticketing system
- Analytics dashboards
- UI redesign or theming changes
- Push notification for cancellation
- Refund processing

---

## 8. Files Changed

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
| `apps/api-gateway/src/inventory.spec.ts` | 9 tests |
| `apps/api-gateway/jest.config.js` | Jest config |
| `apps/api-gateway/package.json` | Added test script, devDependencies |
| `apps/api-gateway/tsconfig.json` | Excluded spec files from build |
