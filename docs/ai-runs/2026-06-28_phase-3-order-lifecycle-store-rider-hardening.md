# Phase 3 — Order Lifecycle Store & Rider Hardening

## Meta

| Field | Value |
|-------|-------|
| Branch | `phase-3-order-lifecycle-store-rider-hardening` |
| Base commit | `a2c449b` |
| Final commit | `eae7d6e` |
| CI run URL | N/A (no CI triggered yet) |
| CI status | Build+tests pass locally |

## State Machine Summary

```
PENDING ──► CONFIRMED ──► PICKING ──► PACKED ──► RIDER_ASSIGNED ──► OUT_FOR_DELIVERY ──► DELIVERED
   │            │            │            │              │                   │
   └─────► CANCELLED ◄───────┴────────────┴──────────────┴───────────────────┘

PAYMENT_PENDING ──► CONFIRMED
                 ──► PAYMENT_FAILED
                 ──► CANCELLED

PAYMENT_FAILED ──► PAYMENT_PENDING
               ──► CANCELLED
```

Terminal states: `DELIVERED`, `CANCELLED` — immutable once reached.

## Role Capability Matrix

| Transition | Admin | Store Owner | Rider | Customer |
|---|---|---|---|---|
| PENDING → CONFIRMED | ✓ | ✓ | ✗ | ✗ |
| PENDING → CANCELLED | ✓ | ✓ | ✗ | ✓ |
| CONFIRMED → PICKING | ✓ | ✓ | ✗ | ✗ |
| CONFIRMED → PACKED | ✓ | ✓ | ✗ | ✗ |
| CONFIRMED → RIDER_ASSIGNED | ✓ | ✗ | ✗ | ✗ |
| CONFIRMED → CANCELLED | ✓ | ✓ | ✗ | ✓ |
| PICKING → PACKED | ✓ | ✓ | ✗ | ✗ |
| PICKING → CANCELLED | ✓ | ✓ | ✗ | ✗ |
| PACKED → RIDER_ASSIGNED | ✓ | ✗ | ✗ | ✗ |
| PACKED → CANCELLED | ✓ | ✓ | ✗ | ✗ |
| RIDER_ASSIGNED → OUT_FOR_DELIVERY | ✓ | ✗ | ✓ (own) | ✗ |
| RIDER_ASSIGNED → CANCELLED | ✓ | ✗ | ✗ | ✗ |
| OUT_FOR_DELIVERY → DELIVERED | ✓ | ✗ | ✓ (own) | ✗ |
| OUT_FOR_DELIVERY → CANCELLED | ✓ | ✗ | ✗ | ✗ |
| Assign rider | ✗ | ✗ | ✓ (self) | ✗ |
| Reassign rider | ✓ | ✗ | ✗ | ✗ |
| Force cancel | ✓ | ✗ | ✗ | ✗ |

## Files Changed

| File | Change |
|------|--------|
| `apps/api-gateway/src/orders/order.service.ts` | Hardened state machine; `updateStatus` with role validation; `assignRider` with active-order conflict, offline rejection; `reassignRider` **fixed** to set `order.status = RIDER_ASSIGNED` and **added** active-order conflict check for new rider; `forceCancel` with inventory restore + refund; delivery proof metadata on DELIVERED |
| `apps/api-gateway/src/orders/order.controller.ts` | Added `GET /orders/store`, `PATCH /orders/:id/force-cancel`, `POST /orders/:id/reassign-rider` |
| `apps/api-gateway/src/orders/dto/force-cancel-order.dto.ts` | NEW — optional `reason` field |
| `apps/api-gateway/src/orders/dto/reassign-rider.dto.ts` | NEW — `userId` field |
| `apps/api-gateway/src/orders.spec.ts` | 43 integration tests (NEW) |
| `apps/api-gateway/package.json` | `test:ci` includes orders |
| `PHASE-3-PROOF.md` | Proof file |
| `docs/ai-runs/2026-06-28_phase-3-order-lifecycle-store-rider-hardening.md` | This file |

## Tests Added / Passed

**72 total tests pass** (43 order + 29 inventory/payments)

### Order Tests (43)

- **State Machine** (6): Invalid transitions rejected, terminal immutability, valid transitions, history recording
- **Store Owner** (7): List own orders, cross-store rejection, forbidden statuses (DELIVERED/RIDER_ASSIGNED/OUT_FOR_DELIVERY), allowed statuses
- **Rider** (10): Assignment flow, duplicate-assignment, offline rejection, non-rider rejection, delivered-order rejection, OUT_FOR_DELIVERY, other-rider rejection, invalid RIDER_TRANSITIONS, DELIVERED+deliveryProof, history recording
- **Admin** (11): Status update, reassign on RIDER_ASSIGNED (keeps status+changes rider), non-admin cannot reassign, force cancel, non-admin cannot force cancel, delivered rejection, **reassign on CONFIRMED** (sets RIDER_ASSIGNED), **reassign on PACKED** (sets RIDER_ASSIGNED), **active RIDER_ASSIGNED rejection**, **active OUT_FOR_DELIVERY rejection**, **no false self-conflict**
- **Customer** (5): PENDING cancellation, other-customer rejection, post-assignment rejection, inventory restore+ledger, history
- **Full Flow** (2): PENDING→DELIVERED lifecycle (6 transitions), rider BUSY→ONLINE lifecycle
- **Listing** (2): Store orders filtered by owner, statusHistory included

## Fix: reassignRider Blocker 1

**Problem**: `reassignRider()` changed `riderId` and `riderAssignedAt` but did not set `order.status = RIDER_ASSIGNED`. The status history also recorded `RIDER_ASSIGNED` while the order row remained `CONFIRMED`/`PACKED`.

**Fix** (`order.service.ts:670-677`):
```typescript
const wasAlreadyAssigned = order.status === OrderStatus.RIDER_ASSIGNED;

const updateData: any = {
  riderId: newRiderProfile.id,
  riderAssignedAt: new Date(),
};
if (!wasAlreadyAssigned) {
  updateData.status = OrderStatus.RIDER_ASSIGNED;
}
```
- If order is `CONFIRMED`/`PICKING`/`PACKED` → status is set to `RIDER_ASSIGNED`
- If order is already `RIDER_ASSIGNED` → status stays, only rider changes
- `fromStatus` in history always reflects the actual previous status
- Metadata includes `wasAlreadyAssigned` boolean

## Fix: reassignRider Blocker 2

**Problem**: `reassignRider()` did not check whether the new rider already has active orders, so a busy rider could be assigned a second delivery.

**Fix** (`order.service.ts:640-647`):
```typescript
const activeOrderForNewRider = await prisma.order.findFirst({
  where: {
    riderId: newRiderProfile.id,
    id: { not: orderId },  // exclude current order
    status: { in: [OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY] },
  },
  select: { id: true, status: true },
});
if (activeOrderForNewRider) {
  throw new ConflictException(
    `New rider has active order ${activeOrderForNewRider.id} (${activeOrderForNewRider.status}). Complete it before reassigning.`,
  );
}
```

## Delivery Proof Foundation

On `DELIVERED` transition, `OrderStatusHistory.metadata` stores:
```json
{
  "deliveredAt": "2026-06-28T...",
  "actorRole": "RIDER",
  "riderProfileId": "...",
  "deliveryProof": {
    "method": "rider_confirmed",
    "timestamp": "2026-06-28T..."
  }
}
```
No schema migration required — uses existing `OrderStatusHistory.metadata` JSON field.

## Known Limitations

1. **Delivery proof is foundation only** — photo upload, signature, OTP verification not yet implemented; only `rider_confirmed` method exists
2. **No WebSocket room cleanup** — rider is set to ONLINE on delivery but `rider_profile.latitude`/`longitude` stale until next ping
3. **Rider location tracking** — live ping and ETA computation exist but have no staleness fallback beyond 6-minute threshold
4. **`test:ci` script** — single-quote regex pattern works on Linux CI but may fail on Windows cmd; CI assumes bash
5. **No coupon/loyalty/reviews/analytics** — explicitly out of scope for Phase 3
6. **No real payment gateway** — all payments are simulated
7. **Force cancel does not update inventory for PAYMENT_FAILED orders** — intentional: inventory was never decremented
8. **Tests are integration tests against real DB** — require running PostgreSQL; no unit-test isolation
