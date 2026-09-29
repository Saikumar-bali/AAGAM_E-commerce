# Phase 10 — Post-Delivery Experience

Branch: post-delivery

Scope:

- customer rating after delivery
- duplicate rating blocked
- rating before delivery blocked
- customer support ticket from order
- admin support queue
- customer privacy checks

Storage:

- uses OrderStatusHistory metadata
- no Prisma migration in this checkpoint

Changed:

- post-delivery service and controller
- order module wiring
- customer feedback page
- admin support queue page
- backend proof test

Run:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
```

Manual UI:

- open /shop/orders/<ORDER_ID>/feedback
- submit rating after delivery
- open support ticket
- open /admin/support

Status: pending local proof.
