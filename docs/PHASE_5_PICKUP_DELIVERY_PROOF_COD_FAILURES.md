# Phase 5 — Pickup Proof, Delivery Proof, COD, and Failed Deliveries

Phase 5 continues from `agent/phase-4-rider-portal-complete`. It converts the earlier delivery-operation records into durable proof and ledger aggregates while retaining the canonical `DeliveryJob` state machine.

## Pickup proof

Pickup can be completed only through one of these role-scoped methods:

- `STORE_PICKUP_PIN`: the owning store issues a six-digit, 15-minute challenge and the assigned Rider verifies it.
- `QR_CODE`: the owning store issues a high-entropy, 15-minute QR payload and the assigned Rider submits the scanned value.
- `STORE_CONFIRMED_HANDOFF`: the owning store confirms physical handoff directly.

PIN and QR values are returned only to the authenticated owning-store response. Only a salted hash is stored. New challenges supersede prior pending challenges and five incorrect attempts disable a challenge.

Every successful `PickupProof` records the canonical delivery job and order, Rider profile ID, owning store user ID, verification timestamp, optional coordinates and accuracy, parcel count, method, and optional challenge ID. The Rider item checklist must already be `VERIFIED`. Successful proof atomically transitions `RIDER_AT_STORE` to `PICKUP_VERIFIED`.

The old order-based Rider pickup endpoint now returns `410 Gone`; it cannot bypass store proof.

## Delivery proof

Professional delivery completion requires all of:

- the assigned Rider is at the customer;
- a current six-digit customer OTP/PIN;
- explicit Rider physical-handoff confirmation;
- full COD collection when the order is COD;
- an optional factual delivery note;
- latitude and longitude together when location is available.

The OTP remains salted, hashed, expiring, attempt-limited, and customer-scoped. OTP hash material is removed from Rider, Store, Customer, and Admin summary responses. A successful `DeliveryProof` records the Rider, customer, verification method, OTP operation reference, Rider confirmation time, verified time, note, and optional coordinates before the job becomes `DELIVERED`.

Photo, signature, and restricted-goods identity proof remain later extensions. Phase 5 does not claim them.

## Independent COD ledger

`CodLedger` is separate from `RiderEarning`. No order total or earning record is used as Rider income or COD cash.

Each COD delivery has one ledger with:

- expected COD;
- collected COD and collection timestamp;
- Rider holding balance;
- deposited amount;
- settlement reference;
- signed variance;
- settlement status;
- append-only `CodLedgerEntry` audit records.

Statuses are `AWAITING_COLLECTION`, `HELD_BY_RIDER`, `PARTIALLY_DEPOSITED`, `SETTLED`, and `VARIANCE_REVIEW`. Collection must equal the expected payment amount. Deposits cannot exceed Rider-held cash. Finalizing a non-zero variance requires a factual variance reason. Reassignment and cancellation are blocked while the Rider holds COD cash.

## Controlled failed-delivery policy

| Reason | System recommendation |
| --- | --- |
| `CUSTOMER_UNREACHABLE` | `RETRY_DELIVERY` |
| `CUSTOMER_REFUSED` | `RETURN_TO_STORE` |
| `ADDRESS_NOT_FOUND` | `ESCALATE_TO_ADMIN` |
| `WRONG_ADDRESS` | `ESCALATE_TO_ADMIN` |
| `PAYMENT_NOT_AVAILABLE` | `RETRY_DELIVERY` |
| `VEHICLE_BREAKDOWN` | `REASSIGN_RIDER` |
| `PACKAGE_DAMAGED` | `RETURN_TO_STORE` |
| `SAFETY_CONCERN` | `ESCALATE_TO_ADMIN` |
| `OTHER` | `ESCALATE_TO_ADMIN` |

Every failure creates a versioned `DeliveryFailureDecision`. Admin can apply the system decision or override it with a mandatory reason. Actions are executed through the canonical workflow:

- retry returns the current job to `OUT_FOR_DELIVERY`;
- reassign returns it to `WAITING_FOR_DISPATCH` and releases the Rider;
- return moves it to `RETURNING_TO_STORE` and still requires physical store receipt;
- cancel creates a pending refund only for a captured online payment;
- escalate keeps the failed job open for Admin review.

## API

```text
POST /orders/delivery-operations/jobs/:id/pickup/challenge
POST /orders/delivery-operations/jobs/:id/pickup/verify
POST /orders/delivery-operations/jobs/:id/pickup/confirm
POST /orders/delivery-operations/jobs/:id/otp/issue
GET  /orders/delivery-operations/jobs/:id/otp/customer
POST /orders/delivery-operations/jobs/:id/complete
POST /orders/delivery-operations/jobs/:id/cod/collect
POST /orders/delivery-operations/jobs/:id/cod/settle
POST /orders/delivery-operations/jobs/:id/failure
POST /orders/delivery-operations/jobs/:id/failure-resolution
POST /orders/delivery-operations/jobs/:id/return/start
POST /orders/delivery-operations/jobs/:id/return/confirm
```

## Migration and environment

Apply migration `20260713123000_phase_5_delivery_proof_cod_failures` to an isolated database before testing.

Production requires a strong `DELIVERY_OTP_SECRET` of at least 32 characters, different from `JWT_SECRET` and `RIDER_BANK_ENCRYPTION_KEY`.

## Automated validation

```bash
npx prisma validate --schema packages/database/prisma/schema.prisma
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run test:phase5
npm run build:api
npm run build:admin
npx playwright test --config apps/admin-dashboard/playwright.config.ts --project=phase-5-delivery-proof --list
```

Automated validation does not prove physical parcel handoff, real GPS availability, cash custody, or human separation of roles. Those require the exact-commit scenario issues and sanitized local evidence.
