# Phase 3 — Order Lifecycle Store & Rider Hardening

## Files Changed

| File | Change |
|------|--------|
| `apps/api-gateway/src/orders/order.service.ts` | Hardened state machine with ORDER_TRANSITIONS, RIDER_TRANSITIONS, STORE_OWNER_TRANSITIONS; role-based validation in `updateStatus`; `assignRider` with active-order conflict check, offline-rider rejection, status guards; `reassignRider` (admin-only); `forceCancel` with inventory restore, refund, rider status; delivery proof metadata on DELIVERED; LSP type-error fixes (4x `.includes()` narrowing) |
| `apps/api-gateway/src/orders/order.controller.ts` | Added `GET /orders/store` (store owner), `PATCH /orders/:id/force-cancel` (admin), `POST /orders/:id/reassign-rider` (admin) |
| `apps/api-gateway/src/orders/dto/force-cancel-order.dto.ts` | NEW — optional `reason` field |
| `apps/api-gateway/src/orders/dto/reassign-rider.dto.ts` | NEW — `userId` field |
| `apps/api-gateway/src/orders.spec.ts` | NEW — 38 integration tests across 8 describe blocks |
| `apps/api-gateway/package.json` | Updated `test:ci` to include `orders` |

## Test Results (67 passed, 0 failed)

```
PASS src/payments.spec.ts     (29 tests)
PASS src/orders.spec.ts       (38 tests)
PASS src/inventory.spec.ts    (all passed)
```

### Orders Test Coverage

- **State Machine** (6): Invalid transitions rejected, valid allowed, terminal states immutable, status history recorded
- **Store Owner** (7): Can list own orders, cannot update other stores, cannot set DELIVERED/RIDER_ASSIGNED/OUT_FOR_DELIVERY, can set CONFIRMED/PICKING/PACKED/CANCELLED
- **Rider** (10): Assignment flow, duplicate-assignment rejection, offline-rider rejection, non-rider rejection, delivered-order rejection, OUT_FOR_DELIVERY transition, other-rider rejection, invalid transition, DELIVERED with delivery proof metadata, status-history on assignment
- **Admin** (6): Any status update, rider reassign, non-admin cannot reassign, force cancel with inventory restore + metadata, non-admin cannot force cancel, already-delivered rejection
- **Customer** (5): PENDING cancellation, other-customer rejection, post-assignment rejection, inventory restore + ledger, status history
- **Full Flow** (2): Complete lifecycle PENDING→DELIVERED (6 transitions), rider BUSY→ONLINE lifecycle
- **Listing** (2): Store orders filtered by owner, statusHistory included

## Commits

```
ff0afce feat: harden order lifecycle with role-based state machine, rider ops, delivery proof, admin force-cancel
eae7d6e fix: reassignRider sets order.status=RIDER_ASSIGNED and checks active-order conflict
8a38882 docs: update proof files with final SHA eae7d6e
8a38882 (pending) docs: add CI run URL and results
```

Branch: `phase-3-order-lifecycle-store-rider-hardening`

## CI

| Job | Status |
|-----|--------|
| Build | ✅ **PASSED** (1m 38s) |
| Service Tests | ✅ **PASSED** (1m 43s) |
| ├─ prisma validate | ✅ |
| ├─ prisma migrate deploy | ✅ |
| ├─ prisma migrate status | ✅ |
| └─ npm run test:ci | ✅ **72 tests passed** |

**Run URL:** https://github.com/Saikumar-bali/AAGAM_E-commerce/actions/runs/28326812323

## Key Design Decisions

- **Delivery proof**: `OrderStatusHistory.metadata` stores `{deliveredAt, actorRole, riderProfileId, deliveryProof: {method: 'rider_confirmed', timestamp}}` — no schema migration needed
- **Role isolation**: Rider can only update own assigned orders with limited transitions; Store owner cannot touch delivery-flow statuses; Admin is unrestricted
- **Inventory + refund safety**: `forceCancel` restores inventory (skips if PAYMENT_FAILED) and creates refund for CAPTURED payments; rider set back to ONLINE
- **Rider concurrency**: `assignRider` checks rider has no active orders (RIDER_ASSIGNED or OUT_FOR_DELIVERY) before accepting a new one
