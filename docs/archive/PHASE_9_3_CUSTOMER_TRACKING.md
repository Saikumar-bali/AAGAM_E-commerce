# Phase 9.3 — Customer Tracking Polish

Branch: customer-tracking

Scope:

- customer order list supports packed, rider assigned, out for delivery and delivered states
- customer order detail shows delivery progress, ETA, stale tracking warning and proof summary
- customer tracking remains customer-private

Changed:

- apps/admin-dashboard/src/app/(shop)/shop/orders/page.tsx
- apps/admin-dashboard/src/app/(shop)/shop/orders/[id]/page.tsx
- apps/api-gateway/src/phase9-customer-tracking-orders.spec.ts

Proof test covers:

- delivered tracking state
- proof metadata in timeline
- trip summary
- stale tracking state
- customer privacy check

Run:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
```

Manual UI:

- open /shop/orders
- open /shop/orders/<ORDER_ID>
- verify packed, rider assigned, live, stale and delivered states

Status: pending local proof.
