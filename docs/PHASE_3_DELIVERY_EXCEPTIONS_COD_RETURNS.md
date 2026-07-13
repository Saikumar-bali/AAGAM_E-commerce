# Phase 3 — Delivery Exceptions, COD, Returns, and Handoff Verification

Base: `737080c0116bb4487dbb5e62e5a4633462878ab7`

Branch: `phase-3-delivery-exceptions-cod-returns`

Pull request: `#24`

## Objective

Complete the delivery lifecycle beyond the happy path. Phase 3 introduces durable customer handoff verification, delivery failure reasons, return-to-store processing, COD collection and settlement, returned-item inspection, inventory restoration, notifications, and audit evidence.

## Domain rules

### Customer handoff

- A delivery OTP is issued only for a job assigned to the authenticated rider.
- The authenticated customer retrieves the active OTP from a customer-only route.
- The database stores a salted hash, never the plaintext OTP.
- The plaintext code is deterministically derived only when the authorized customer requests it.
- OTPs expire after five minutes, have a five-attempt limit, and are superseded by a newer OTP.
- When `DELIVERY_OTP_REQUIRED=true`, the rider cannot complete delivery until the OTP is verified.
- Both current and legacy delivery-completion endpoints pass through the same Phase 3 OTP/COD gate.

### COD

- COD collection applies only to payments with method `COD`.
- The collected amount must exactly match the payment amount in paise.
- Collection is idempotent and changes the payment from `PENDING_COD` to `CAPTURED`.
- Settlement is recorded separately with a reference, actor, amount, and timestamp.
- When `COD_COLLECTION_REQUIRED=true`, COD delivery cannot complete before collection.
- Collection and settlement are separate audit operations; settlement does not overwrite collection evidence.

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
- The inspection must account for every ordered unit.
- Only sellable quantity is restored to store inventory.
- Every stock change creates an `InventoryLedger` entry.
- A completed inspection is idempotent and cannot be submitted twice.
- The rider becomes available only after the return is confirmed at the store.

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

Every mutating endpoint accepts an `Idempotency-Key` header.

## Implemented UI

### Rider / Partners

- `Operations` tab for OTP issuance, exact COD collection, verified completion, failure reasons, and return start.
- Only actions valid for the current job/payment state are enabled.
- The normal rider dashboard no longer exposes generic delivery completion at `RIDER_AT_CUSTOMER`.
- The rider never receives or displays the plaintext OTP.

### Store / Partners

- `Operations` tab with the owning-store returns and COD queue.
- Confirm physical returned-to-store receipt.
- Inspect returned quantities with explicit sellable/damaged/missing fields.
- Restore only sellable stock.
- Record COD settlement using a traceable reference.

### Admin web

- `/admin/delivery-exceptions` command centre.
- Filters for exceptions, returns, and COD work.
- Physical-return confirmation, explicit return inspection, and COD settlement controls.
- Actor, time, reason, status, and operation audit visibility.

### Customer web

- `/shop/delivery-code/:deliveryJobId` customer-only handoff screen.
- OTP notification deep-links to the authenticated customer route.
- The screen explains that the code must be shared only after checking the parcel.

## Environment controls

```dotenv
DELIVERY_OTP_SECRET=<strong secret different from JWT_SECRET>
DELIVERY_OTP_REQUIRED=false
COD_COLLECTION_REQUIRED=false
```

Production must set a strong `DELIVERY_OTP_SECRET`. The local development fallback must never be relied on in production.

## Automated acceptance

- migration applies cleanly to PostgreSQL;
- OTP is hashed, expiring, attempt-limited, and rider/customer scoped;
- COD exact-amount and idempotency checks pass;
- required OTP/COD gates prevent premature delivery;
- current and legacy completion routes use the same gate;
- wrong-role and wrong-rider operations are rejected;
- complete failure/return state machine passes;
- sellable-only inventory restoration and ledger audit pass;
- duplicate inspection and duplicate collection are safe;
- operation queue is restricted to admin/owning store;
- notifications/outbox events are created for operational changes;
- full API regression, monorepo build, mobile TypeScript/tests, Android APK, CodeQL, and CodeQL Advanced pass.

## Local verification commands

```bash
npm install
npx prisma validate --schema packages/database/prisma/schema.prisma
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npx prisma migrate status --schema packages/database/prisma/schema.prisma
npm run test:phase3 --workspace=apps/api-gateway
npm run test:phase3 --workspace=AagamPartners
npm test --workspace=apps/api-gateway
npx turbo build --force
```

Android debug build:

```bash
cd apps/mobile-partners/android
gradle assembleDebug --no-daemon --stacktrace
```

Headed web proof requires the API on `http://localhost:3005`, the dashboard on `http://localhost:3001`, and QA credentials supplied through environment variables:

```bash
export QA_ADMIN_EMAIL='admin@aagam.com'
export QA_ADMIN_PASSWORD='<local QA password>'
export QA_CUSTOMER_EMAIL='customer@aagam.com'
export QA_CUSTOMER_PASSWORD='<local QA password>'
npx playwright test --project=phase-3-delivery-operations --headed
```

Do not commit QA passwords, Firebase credentials, database URLs, or the OTP secret.

## Required manual evidence

Automated tests prove domain behavior, compilation, migration safety, and API invariants. They do not prove physical cash handling, real parcel handoff, real-device navigation, or human role separation.

Manual evidence must show:

1. Customer-only OTP retrieval and successful verified handoff.
2. Wrong OTP rejection and attempt-limit behavior.
3. Exact COD collection before completion and separate store/admin settlement.
4. Failed delivery reason, return start, physical store receipt, and rider release.
5. Explicit sellable/damaged/missing inspection with sellable-only inventory restoration.
6. Inventory ledger and append-only operation audit records.
7. Admin, Store, Rider, and Customer UI screenshots on the exact tested commit.
8. Headed Playwright results and Android APK/device proof.

## Scenario evidence workflow

Manual/local scenarios are tracked as GitHub issues. Each issue contains the exact commit, actors, setup, steps, expected result, and required evidence. The issue remains open until submitted evidence is reviewed. Unacceptable or incomplete proof receives a review comment explaining what must be repeated.

PR #24 remains draft and must not be merged or deployed until the required manual issues are reviewed. Deployment remains a later final phase.
