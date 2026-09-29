# Phase 8.2 — Store Item Availability and Substitutes

Branch: `phase8b`

## Scope

This checkpoint adds store-side handling for unavailable order items before an order is marked ready for rider pickup.

## Backend

Added:

- `StoreFulfillmentService`
- `StoreFulfillmentController`

Endpoints:

- `PATCH /orders/store/:orderId/items/:itemId/unavailable`
- `GET /orders/store/:orderId/items/:itemId/substitutes`
- `PATCH /orders/store/:orderId/items/:itemId/substitute`
- `PATCH /orders/store/:orderId/ready`

Behavior:

- store owner can mark an order item unavailable
- substitutes are limited to same-category, active, in-stock products from the same store
- replacement updates the order item and order totals
- issue/substitution audit data is recorded in order snapshots and status history
- ready-for-pickup is blocked until unavailable items are resolved

## Frontend

Updated:

- `apps/admin-dashboard/src/app/(store)/store/orders/page.tsx`

Added:

- item unavailable button
- substitutes button
- replace-with-substitute action
- guarded ready-for-pickup action using `/orders/store/:orderId/ready`

## Proof

Added:

- `apps/api-gateway/src/phase8b-orders.spec.ts`

Test proves:

1. unavailable item blocks ready-for-pickup
2. substitute list includes valid replacement
3. substitute updates the order item
4. order total updates after replacement
5. ready-for-pickup succeeds after issue resolution

## Local verification

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
npm run dev --workspace=apps/api-gateway
npm run dev --workspace=apps/admin-dashboard
```

Open:

```text
http://localhost:3001/store/orders
```

Verify:

- mark item unavailable
- load substitutes
- replace with substitute
- ready-for-pickup is blocked before resolution
- ready-for-pickup works after resolution

Status: pending local verification.
