# Phase 9.1 — Rider Assignment and Pickup Operations

Branch: `dispatch-final`

## Scope

This checkpoint connects the store-ready state to rider delivery operations.

## Backend

Added:

- `DispatchService`
- `DispatchController`

Endpoints:

- `GET /orders/dispatch/board`
- `POST /orders/dispatch/:orderId/assign`
- `PATCH /orders/dispatch/:orderId/rider/accept`
- `PATCH /orders/dispatch/:orderId/rider/reject`
- `PATCH /orders/dispatch/:orderId/rider/pickup`

Behavior:

- admin/store owner can view packed orders waiting for rider
- board returns available riders and active deliveries
- admin/store owner can assign an available rider to a packed order
- rider can accept an assignment
- rider can reject an assignment and the order returns to `PACKED`
- rider can mark pickup, moving the order to `OUT_FOR_DELIVERY`
- rider status moves to `BUSY` after assignment and back to `ONLINE` after rejection

## Frontend

Added:

- `apps/admin-dashboard/src/app/(admin)/admin/dispatch/page.tsx`

UI supports:

- waiting-for-rider queue
- available rider list
- active delivery list
- assign rider action

## Backend proof

Added:

- `apps/api-gateway/src/phase9-orders.spec.ts`

Test coverage:

1. board shows packed order waiting for rider
2. board shows available rider
3. admin assigns rider to packed order
4. rider becomes busy
5. rider accepts assignment
6. rider marks pickup and order becomes `OUT_FOR_DELIVERY`
7. rider rejects assignment and order returns to `PACKED`
8. rejected rider becomes `ONLINE`

## Local checks

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
```

## Manual API flow

1. create or use a `PACKED` order
2. set a rider profile to `ONLINE`
3. open dispatch board
4. assign rider to packed order
5. rider accepts assignment
6. rider marks pickup
7. verify order is `OUT_FOR_DELIVERY`

Status: pending local proof.
