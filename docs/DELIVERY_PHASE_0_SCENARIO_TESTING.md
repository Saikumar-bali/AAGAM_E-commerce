# Phase 0 Delivery Scenario Testing

Branch: `phase-0-delivery-domain-foundation`

Use this document to report exactly what works and what fails after pulling the branch. Do not merge until the automated and manual evidence is complete.

## 1. Pull and install

```bash
git fetch origin
git checkout phase-0-delivery-domain-foundation
git pull origin phase-0-delivery-domain-foundation
npm install
```

Confirm:

```bash
git branch --show-current
git rev-parse HEAD
```

Expected branch:

```text
phase-0-delivery-domain-foundation
```

## 2. Database safety

Use a local/test PostgreSQL database. Back up any database containing important data before applying the migration.

```bash
npx prisma validate --schema=packages/database/prisma/schema.prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma
npx prisma migrate status --schema=packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

Expected new migration:

```text
20260710230000_phase_0_delivery_domain_foundation
```

Verify these tables exist:

```text
DeliveryJob
DispatchAssignment
DeliveryEvent
```

Verify migration failure does not occur when creating the partial unique indexes.

## 3. Automated proof

Focused Phase 0 tests:

```bash
npm run test:phase0 --workspace=apps/api-gateway
```

Full existing tests:

```bash
npm test
```

Build:

```bash
npx turbo build --force
```

Minimum evidence:

```text
Prisma validate: PASS/FAIL
Prisma generate: PASS/FAIL
Migration deploy: PASS/FAIL
Phase 0 focused tests: PASS/FAIL
Full npm test: PASS/FAIL
Turbo build: PASS/FAIL
```

On failure, copy the first complete error block, including filename and line number.

## 4. Run web applications

Open separate terminals:

```bash
npm run dev --workspace=apps/api-gateway
```

```bash
npm run dev --workspace=apps/admin-dashboard
```

Use the existing credentials from the local `.env`/seed setup for:

- customer
- store owner
- admin
- rider A
- rider B when available

Do not post passwords in the report.

## 5. Scenario A — Store packing creates delivery job

### Steps

1. Log in as customer.
2. Place a COD order for an in-stock product.
3. Record the order ID.
4. Log in as the owning store.
5. Accept/confirm the order.
6. Start picking.
7. Resolve any unavailable-item issue.
8. Mark the order ready for pickup/packed.
9. Log in as admin.
10. Open `/admin/dispatch`.

### Expected

- Store order becomes `PACKED`.
- Admin dispatch shows exactly one waiting delivery job for the order.
- Job status is `WAITING_FOR_DISPATCH`.
- It is not duplicated after refreshing several times.
- The waiting-age label is visible.
- The same order remains visible through existing store/customer order pages.

### Report

```text
A1 Customer order created:
A2 Store confirmed order:
A3 Store picking works:
A4 Store ready-for-pickup works:
A5 Delivery job appears:
A6 Job status WAITING_FOR_DISPATCH:
A7 Refresh does not duplicate job:
First error block:
```

## 6. Scenario B — Confirmed/picking orders are hidden from rider

### Steps

1. Create a second customer order.
2. Leave it `CONFIRMED` or `PICKING`; do not pack it.
3. Log in as a rider.
4. Open `/rider`.
5. Refresh the rider workspace.

### Expected

- The confirmed/picking order does not appear as an offer.
- It does not become the active delivery.
- Rider cannot browse general unassigned orders.
- Rider sees only offers addressed to that rider or their accepted job.

### Optional API check

```bash
curl -i http://localhost:3000/orders/rider/queue \
  -H "Authorization: Bearer RIDER_TOKEN"
```

Expected: no `CONFIRMED` or `PICKING` orders.

### Report

```text
B1 Confirmed order hidden:
B2 Picking order hidden:
B3 No public rider queue:
First error block:
```

## 7. Scenario C — Admin creates timed rider offer

### Preconditions

- Scenario A job is waiting.
- Rider A status is `ONLINE`.
- Rider A has no active job.

### Steps

1. Open `/admin/dispatch` as admin.
2. Select Rider A for the waiting job.
3. Click **Send offer** once.
4. Refresh the page.
5. Attempt to send another offer for the same job if the UI/API permits.

### Expected

- The button says **Send offer**, not immediate assignment.
- Job remains `WAITING_FOR_DISPATCH` until Rider A accepts.
- UI shows **Awaiting rider response**.
- Assignment status is `OFFERED`.
- A second open offer is blocked with conflict behavior.
- Rider remains `ONLINE` before acceptance.

### Report

```text
C1 Offer created:
C2 Job remains waiting before accept:
C3 Pending-offer UI visible:
C4 Duplicate offer blocked:
C5 Rider remains ONLINE:
First error block:
```

## 8. Scenario D — Wrong rider cannot accept

### Preconditions

- Offer belongs to Rider A.
- Rider B account is available.

### Steps

1. Record the assignment ID from the network response or database.
2. Log in as Rider B.
3. Call:

```bash
curl -i -X PATCH \
  http://localhost:3000/orders/dispatch/assignments/ASSIGNMENT_ID/accept \
  -H "Authorization: Bearer RIDER_B_TOKEN"
```

### Expected

- Response is `403 Forbidden`.
- Message states the offer belongs to another rider.
- Job remains waiting.
- Rider B remains available.

### Report

```text
D1 Wrong rider receives 403:
D2 Job unchanged:
D3 Rider B unchanged:
First error block:
```

## 9. Scenario E — Rider accepts offer

### Steps

1. Log in as Rider A.
2. Open `/rider`.
3. Confirm the offer card shows store, area, items, payment method, order value, and countdown.
4. Click **Accept job** once.
5. Immediately click again or repeat the accept API request.

### Expected

Atomic state after first acceptance:

```text
DispatchAssignment = ACCEPTED
DeliveryJob = RIDER_ASSIGNED
DeliveryJob.currentRiderId = Rider A
Order = RIDER_ASSIGNED
Order.riderId = Rider A
Rider A = BUSY
```

Additional expectations:

- Offer card disappears.
- Current-delivery panel appears.
- Second acceptance fails safely; no duplicate active job/event is created.
- Admin board moves job from waiting to active.
- Customer/store legacy order views still show assigned state.

### Report

```text
E1 Offer card correct:
E2 Accept works:
E3 Assignment ACCEPTED:
E4 Job RIDER_ASSIGNED:
E5 Legacy order synchronized:
E6 Rider BUSY:
E7 Duplicate acceptance blocked:
E8 Admin active board updated:
First error block:
```

## 10. Scenario F — One active delivery per rider

### Steps

1. Keep Rider A's first job active.
2. Pack another order.
3. On admin dispatch, try to select/offer the second job to Rider A.

### Expected

- Rider A is not listed as available, or API returns `409 Conflict`.
- Second job remains `WAITING_FOR_DISPATCH`.
- First job is unchanged.

### Report

```text
F1 Rider A unavailable for second job:
F2 API conflict if forced:
F3 First job unchanged:
F4 Second job remains waiting:
First error block:
```

## 11. Scenario G — Accepted rider rejection before travel

Use a separate test order or reset the flow before starting travel.

### Steps

1. Admin offers job to Rider A.
2. Rider A accepts.
3. Before clicking **Start trip to store**, call the reject endpoint with a reason.

```bash
curl -i -X PATCH \
  http://localhost:3000/orders/dispatch/assignments/ASSIGNMENT_ID/reject \
  -H "Authorization: Bearer RIDER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Vehicle issue"}'
```

### Expected

```text
Assignment = REJECTED
DeliveryJob = WAITING_FOR_DISPATCH
DeliveryJob.currentRiderId = null
Order = PACKED
Order.riderId = null
Rider A = ONLINE
```

The rejection reason must be stored.

### Report

```text
G1 Accepted assignment rejected:
G2 Job returned to waiting:
G3 Legacy order returned to PACKED:
G4 Rider ONLINE:
G5 Reason stored:
First error block:
```

## 12. Scenario H — Explicit pickup workflow

### Steps

1. Create and accept a fresh offer.
2. Rider clicks **Start trip to store**.
3. Rider clicks **I arrived at store**.
4. Confirm rider UI now tells rider to wait for store verification.
5. As store owner, call pickup verification:

```bash
curl -i -X PATCH \
  http://localhost:3000/orders/dispatch/jobs/DELIVERY_JOB_ID/pickup-verified \
  -H "Authorization: Bearer STORE_TOKEN"
```

6. Rider refreshes and clicks **Start delivery**.

### Expected sequence

```text
RIDER_ASSIGNED
RIDER_EN_ROUTE_TO_STORE
RIDER_AT_STORE
PICKUP_VERIFIED
OUT_FOR_DELIVERY
```

Additional expectations:

- Store owner can verify only their own store's job.
- Rider cannot self-verify pickup.
- Rider cannot start delivery before verification.
- Legacy order remains `RIDER_ASSIGNED` until start delivery, then becomes `OUT_FOR_DELIVERY`.

### Report

```text
H1 Start trip works:
H2 Arrived store works:
H3 Wait-for-store UI shown:
H4 Store verifies pickup:
H5 Rider cannot self-verify:
H6 Start delivery blocked before verify:
H7 Start delivery works after verify:
H8 Legacy status synchronized:
First error block:
```

## 13. Scenario I — Customer arrival and delivery

### Steps

1. Continue from `OUT_FOR_DELIVERY`.
2. Rider clicks **I arrived at customer**.
3. Rider clicks **Confirm delivered**.
4. Check customer order, store order, admin board, and rider workspace.

### Expected

```text
DeliveryJob = DELIVERED
Order = DELIVERED
Order.deliveredAt is populated
Rider = ONLINE
```

Additional expectations:

- Job leaves active-delivery list.
- Rider has no active job.
- Customer/store legacy views still work.
- Delivery events include state changes.
- Existing inventory finalization ledger entry is created once.

Phase 0 does not claim real customer OTP verification. Do not mark OTP as passed unless a later phase implements it.

### Report

```text
I1 Arrived customer works:
I2 Delivered works:
I3 Customer view updated:
I4 Store view updated:
I5 Admin active list updated:
I6 Rider released ONLINE:
I7 Delivery events present:
I8 Inventory finalization not duplicated:
First error block:
```

## 14. Scenario J — Invalid transitions and generic rider endpoint

### Checks

1. From `WAITING_FOR_DISPATCH`, try to mark job `OUT_FOR_DELIVERY` through an explicit endpoint/forced API call.
2. As rider, call generic order status:

```bash
curl -i -X PATCH \
  http://localhost:3000/orders/ORDER_ID/status \
  -H "Authorization: Bearer RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DELIVERED"}'
```

3. As rider, call deprecated self-assignment:

```bash
curl -i -X PATCH \
  http://localhost:3000/orders/assign \
  -H "Authorization: Bearer RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ORDER_ID"}'
```

### Expected

- Invalid state transition returns `400`.
- Generic rider status endpoint returns authorization failure.
- `/orders/assign` returns `410 Gone`.
- No database state changes after any failed request.

### Report

```text
J1 Invalid transition blocked:
J2 Generic rider status blocked:
J3 Self-assignment returns 410:
J4 State unchanged after failures:
First error block:
```

## 15. Scenario K — Store ownership isolation

### Preconditions

Two different store-owner accounts/stores.

### Steps

1. Create a job for Store A.
2. Use Store B token to view/operate on Store A job.
3. Try offer creation and pickup verification.

### Expected

- Store B board does not contain Store A job.
- Forced Store B operations return `403`.
- Store A job remains unchanged.

### Report

```text
K1 Store B board isolated:
K2 Cross-store offer blocked:
K3 Cross-store pickup verification blocked:
K4 Store A state unchanged:
First error block:
```

## 16. Professional UI review

### Admin `/admin/dispatch`

Verify:

```text
Header/command-centre layout:
Waiting/offers/available/active stats:
Waiting cards readable:
Offer dropdown/button usable:
Pending-offer state visible:
Active delivery state visible:
Desktop layout:
Mobile-width layout:
No horizontal overflow:
No console errors:
```

### Rider `/rider`

Verify:

```text
Offer and active job clearly separated:
Countdown updates:
Only one primary next action:
Store directions opens:
Customer call link works after acceptance:
Wait-for-store-verification message:
No fake earnings:
No public queue:
Desktop layout:
Mobile-width layout:
No horizontal overflow:
No console errors:
```

Use browser DevTools responsive widths such as 390×844 and 1440×900.

## 17. Database evidence queries

Run in Prisma Studio or PostgreSQL:

```sql
SELECT id, "orderId", status, "currentRiderId", version, "createdAt", "updatedAt"
FROM "DeliveryJob"
ORDER BY "createdAt" DESC;
```

```sql
SELECT id, "deliveryJobId", "riderProfileId", status, "offeredAt", "respondedAt", "expiresAt", "rejectionReason"
FROM "DispatchAssignment"
ORDER BY "createdAt" DESC;
```

```sql
SELECT "deliveryJobId", "assignmentId", "eventType", "fromStatus", "toStatus", "actorRole", "createdAt"
FROM "DeliveryEvent"
ORDER BY "createdAt" ASC;
```

Confirm:

- no duplicate delivery job for one order
- no two open assignments for one job
- no two active jobs for one rider
- event order matches actions
- legacy order state matches delivery state

## 18. Final report template

```text
Branch: phase-0-delivery-domain-foundation
Commit tested:
Date/time:
Database: local/test
Browser:

AUTOMATED
- npm install:
- Prisma validate:
- Prisma generate:
- migration deploy:
- phase0 focused tests:
- full npm test:
- turbo build:

SCENARIOS
- A Store packing/job creation:
- B Rider queue isolation:
- C Timed offer:
- D Wrong rider blocked:
- E Acceptance/atomic state:
- F One active job per rider:
- G Rejection before travel:
- H Pickup workflow:
- I Delivery completion:
- J Invalid/deprecated APIs:
- K Store ownership isolation:
- Admin UI:
- Rider UI:

DATABASE
- Duplicate delivery jobs:
- Duplicate open offers:
- Multiple active jobs for rider:
- Delivery event audit:
- Legacy order synchronization:

First complete error block:
Screenshots captured:
Overall result: PASS / FAIL
```
