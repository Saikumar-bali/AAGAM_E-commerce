# Phase 9.2 — Rider Delivery Completion and Proof

Branch: `delivery-proof`

## Scope

This checkpoint completes the rider delivery lifecycle after pickup.

## Backend

Added delivery completion support to existing dispatch operations.

Endpoint:

- `PATCH /orders/dispatch/:orderId/rider/deliver`

Body:

```json
{
  "proofType": "RIDER_CONFIRMATION",
  "code": "1234",
  "note": "Handed to customer",
  "latitude": 17.71,
  "longitude": 83.31
}
```

Behavior:

- only assigned rider can complete delivery
- delivery is allowed only from `OUT_FOR_DELIVERY`
- order moves to `DELIVERED`
- `deliveredAt` is set
- rider returns to `ONLINE`
- delivery proof metadata is recorded in order status history
- live tracking rejects further rider pings after delivery

## Existing tracking rule confirmed

Tracking accepts pings only while order is:

- `RIDER_ASSIGNED`
- `OUT_FOR_DELIVERY`

After delivery, order status becomes `DELIVERED`, so further pings are rejected.

## Proof tests

Added:

- `apps/api-gateway/src/phase9-delivery-orders.spec.ts`

Tests prove:

1. rider cannot deliver before pickup
2. rider can ping location while out for delivery
3. rider can submit delivery proof
4. order becomes `DELIVERED`
5. `deliveredAt` is set
6. rider status returns to `ONLINE`
7. proof metadata is recorded
8. location pings are rejected after delivery

## Local verification

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
```

## Manual API flow

1. create or use a `PACKED` order
2. assign rider
3. rider marks pickup
4. rider pings location
5. rider submits delivery proof
6. verify order is `DELIVERED`
7. verify rider is `ONLINE`
8. verify another ping fails

Status: pending local proof.
