# Phase 3 — Delivery Exceptions, COD, Returns, and Handoff Verification

Base: `737080c0116bb4487dbb5e62e5a4633462878ab7`

Branch: `phase-3-delivery-exceptions-cod-returns`

## Objective

Complete the delivery lifecycle beyond the happy path. Phase 3 introduces durable customer handoff verification, delivery failure reasons, return-to-store processing, COD collection and settlement, returned-item inspection, inventory restoration, notifications, and audit evidence.

## Domain rules

### Customer handoff

- A delivery OTP is issued only for a job assigned to the authenticated rider.
- The customer can retrieve the active OTP through an authenticated order endpoint.
- The database stores a salted hash, never the plaintext OTP.
- OTPs expire, have a bounded attempt count, and are superseded by a newer OTP.
- When `DELIVERY_OTP_REQUIRED=true`, the rider cannot complete delivery until the OTP is verified.

### COD

- COD collection applies only to payments with method `COD`.
- The collected amount must exactly match the order amount.
- Collection is idempotent and changes the payment from `PENDING_COD` to `CAPTURED`.
- Settlement is recorded separately with a reference, actor, amount, and timestamp.
- When `COD_COLLECTION_REQUIRED=true`, COD delivery cannot complete before collection.

### Delivery exceptions

Allowed failure reasons:

- `CUSTOMER_UNAVAILABLE`
- `INVALID_ADDRESS`
- `CUSTOMER_REFUSED`
- `PAYMENT_ISSUE`
- `UNSAFE_LOCATION`
- `OTHER`

A failure records the reason and transitions the canonical `DeliveryJob` to `DELIVERY_FAILED`. It does not erase the assignment or audit history.

### Return lifecycle

```text
DELIVERY_FAILED
→ RETURNING_TO_STORE
→ RETURNED_TO_STORE
```

- Rider or admin can start the return.
- The owning store or admin confirms physical return.
- A return inspection classifies each ordered quantity as `SELLABLE`, `DAMAGED`, or `MISSING`.
- Only sellable quantity is restored to store inventory.
- Every stock change creates an `InventoryLedger` entry.
- A completed inspection is idempotent and cannot be submitted twice.

## Durable operation record

Phase 3 adds `DeliveryOperation`, an append-only operational record associated with the order and delivery job.

Operation types:

- `OTP_ISSUED`
- `OTP_ATTEMPT_FAILED`
- `OTP_VERIFIED`
- `DELIVERY_FAILURE_RECORDED`
- `RETURN_STARTED`
- `RETURN_CONFIRMED`
- `RETURN_INSPECTION_COMPLETED`
- `COD_COLLECTED`
- `COD_SETTLED`

Each operation includes actor identity/role, status, JSON details, an idempotency key, and timestamps.

## API surface

Prefix:

```text
/orders/delivery-operations
```

Endpoints:

```text
GET  /queue
GET  /jobs/:deliveryJobId/summary
POST /jobs/:deliveryJobId/otp/issue
GET  /jobs/:deliveryJobId/otp/customer
POST /jobs/:deliveryJobId/failure
POST /jobs/:deliveryJobId/return/start
POST /jobs/:deliveryJobId/return/confirm
POST /jobs/:deliveryJobId/return/inspection
POST /jobs/:deliveryJobId/cod/collect
POST /jobs/:deliveryJobId/cod/settle
POST /jobs/:deliveryJobId/complete
```

## UI scope

### Rider / Partners

- Delivery Operations tab for OTP, COD, failure reasons, and return start.
- Only actions valid for the current job/payment state are enabled.
- No generic order-status mutation is introduced.

### Store / Partners

- Returns queue.
- Confirm returned-to-store.
- Inspect returned quantities and restore only sellable stock.
- View COD and return status.

### Admin web

- Delivery Exceptions page.
- Filter active exception, return, COD, and settlement work.
- View actor/time/reason/inspection audit details.

## Automated acceptance

- migration applies cleanly to PostgreSQL;
- OTP is hashed, expiring, attempt-limited, and rider/customer scoped;
- COD exact-amount and idempotency checks pass;
- required OTP/COD gates prevent premature delivery;
- wrong-role and wrong-rider operations are rejected;
- complete failure/return state machine passes;
- sellable-only inventory restoration and ledger audit pass;
- duplicate inspection and duplicate collection are safe;
- operation queue is restricted to admin/owning store;
- notifications/outbox events are created for operational changes;
- full API regression, monorepo build, mobile TypeScript/tests, Android APK, and CodeQL pass.

## Scenario evidence workflow

Manual/local scenarios are tracked as GitHub issues. Each issue contains the exact commit, actors, setup, steps, expected result, and required evidence. The issue remains open until submitted evidence is reviewed. Unacceptable or incomplete proof receives a review comment explaining what must be repeated.
