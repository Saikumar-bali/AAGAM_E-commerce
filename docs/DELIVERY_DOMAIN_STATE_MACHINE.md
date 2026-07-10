# Delivery Domain State Machine

Branch: `phase-0-delivery-domain-foundation`

## Aggregate boundaries

### Order

`Order` remains the commercial and customer-facing aggregate. It owns:

- customer and store
- items and pricing
- payment
- inventory reservation/finalization
- broad customer-visible status

### DeliveryJob

`DeliveryJob` owns delivery operations after packing. It has exactly one order and may have many assignment attempts over its lifetime.

### DispatchAssignment

`DispatchAssignment` represents one rider offer or accepted assignment. It records who received the offer, expiry, response, rejection reason, and creator.

### DeliveryEvent

`DeliveryEvent` is the append-only operational audit stream for jobs and assignments.

## DeliveryJob statuses

| Status | Meaning |
|---|---|
| `WAITING_FOR_DISPATCH` | Store packed the order; no rider currently owns the job. |
| `RIDER_ASSIGNED` | A rider accepted the assignment. |
| `RIDER_EN_ROUTE_TO_STORE` | Accepted rider started travelling to the store. |
| `RIDER_AT_STORE` | Rider confirmed arrival at the store. |
| `PICKUP_VERIFIED` | Store/admin verified the parcel handoff. |
| `OUT_FOR_DELIVERY` | Rider left the store with the parcel. |
| `RIDER_AT_CUSTOMER` | Rider arrived at the customer location. |
| `DELIVERED` | Customer handoff completed. Terminal. |
| `DELIVERY_FAILED` | Delivery attempt failed and needs an operational decision. |
| `RETURNING_TO_STORE` | Rider is returning the parcel. |
| `RETURNED_TO_STORE` | Parcel reached the store. Operationally terminal until explicitly requeued. |
| `CANCELLED` | Delivery job cancelled. Terminal. |

## Allowed transitions

```text
WAITING_FOR_DISPATCH
  ├─> RIDER_ASSIGNED
  └─> CANCELLED

RIDER_ASSIGNED
  ├─> RIDER_EN_ROUTE_TO_STORE
  ├─> WAITING_FOR_DISPATCH
  └─> CANCELLED

RIDER_EN_ROUTE_TO_STORE
  ├─> RIDER_AT_STORE
  ├─> DELIVERY_FAILED
  └─> CANCELLED

RIDER_AT_STORE
  ├─> PICKUP_VERIFIED
  ├─> DELIVERY_FAILED
  └─> CANCELLED

PICKUP_VERIFIED
  ├─> OUT_FOR_DELIVERY
  └─> CANCELLED

OUT_FOR_DELIVERY
  ├─> RIDER_AT_CUSTOMER
  ├─> DELIVERED
  ├─> DELIVERY_FAILED
  ├─> RETURNING_TO_STORE
  └─> CANCELLED

RIDER_AT_CUSTOMER
  ├─> DELIVERED
  ├─> DELIVERY_FAILED
  ├─> RETURNING_TO_STORE
  └─> CANCELLED

DELIVERY_FAILED
  ├─> WAITING_FOR_DISPATCH
  ├─> RETURNING_TO_STORE
  └─> CANCELLED

RETURNING_TO_STORE
  ├─> RETURNED_TO_STORE
  └─> CANCELLED

RETURNED_TO_STORE
  ├─> WAITING_FOR_DISPATCH
  └─> CANCELLED

DELIVERED and CANCELLED are terminal.
```

## Role-owned transitions in Phase 0

### Rider

A rider may perform only these transitions for their own `currentRiderId` job:

```text
RIDER_ASSIGNED -> RIDER_EN_ROUTE_TO_STORE
RIDER_EN_ROUTE_TO_STORE -> RIDER_AT_STORE
PICKUP_VERIFIED -> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY -> RIDER_AT_CUSTOMER
OUT_FOR_DELIVERY -> DELIVERY_FAILED
RIDER_AT_CUSTOMER -> DELIVERED
RIDER_AT_CUSTOMER -> DELIVERY_FAILED
DELIVERY_FAILED -> RETURNING_TO_STORE
RETURNING_TO_STORE -> RETURNED_TO_STORE
```

### Store owner

A store owner may perform only this Phase 0 delivery transition for an order belonging to their store:

```text
RIDER_AT_STORE -> PICKUP_VERIFIED
```

Store packing creates the job through `StoreFulfillmentService`; it is not a direct delivery transition.

### Admin

Admin may perform any transition allowed by the state machine. Invalid transitions remain blocked.

### Customer

Customer cannot mutate `DeliveryJob` in Phase 0.

## DispatchAssignment statuses

| Status | Meaning |
|---|---|
| `CREATED` | Assignment record created before notification/offer publication. Reserved for later event-outbox work. |
| `OFFERED` | Rider can accept or reject before expiry. |
| `ACCEPTED` | Rider accepted and owns the job. |
| `REJECTED` | Rider rejected the offer or an accepted assignment before travel. |
| `EXPIRED` | Offer deadline passed without acceptance. |
| `CANCELLED` | Dispatcher cancelled the assignment. |
| `REASSIGNED` | Assignment was superseded by another rider. |

Phase 0 creates assignments directly as `OFFERED`. `CREATED`, `CANCELLED`, and `REASSIGNED` are included now so later notification and exception phases do not require another enum redesign.

## Assignment rules

1. The order must be `PACKED` or have a compatible existing delivery state.
2. The delivery job must be `WAITING_FOR_DISPATCH`.
3. The selected user must have role `RIDER` and a rider profile.
4. Rider status must be `ONLINE` when the offer is created.
5. The rider must not already have an active delivery job.
6. Only one open assignment may exist for a job.
7. The offer must be `OFFERED` and unexpired when accepted.
8. Only the offered rider may accept or reject.
9. Acceptance changes assignment to `ACCEPTED`, job to `RIDER_ASSIGNED`, legacy order to `RIDER_ASSIGNED`, and rider to `BUSY` in one serializable transaction.
10. An accepted assignment may be rejected only while the job remains `RIDER_ASSIGNED`; after travel starts, admin exception handling is required.

## Optimistic and database concurrency

`DeliveryJob.version` increments on every state transition. A transition updates only when both expected status and version still match.

The migration also creates:

```sql
CREATE UNIQUE INDEX "DispatchAssignment_one_open_offer_per_job"
ON "DispatchAssignment"("deliveryJobId")
WHERE "status" IN ('CREATED', 'OFFERED', 'ACCEPTED');
```

and:

```sql
CREATE UNIQUE INDEX "DeliveryJob_one_active_job_per_rider"
ON "DeliveryJob"("currentRiderId")
WHERE "currentRiderId" IS NOT NULL
  AND "status" NOT IN ('DELIVERED', 'RETURNED_TO_STORE', 'CANCELLED');
```

Application checks improve error messages; database indexes are the final guarantee.

## Legacy Order synchronization

During migration, every delivery transition also updates the old order representation:

| DeliveryJob status | Legacy Order status |
|---|---|
| `WAITING_FOR_DISPATCH` | `PACKED` |
| `RIDER_ASSIGNED` through `PICKUP_VERIFIED` | `RIDER_ASSIGNED` |
| `OUT_FOR_DELIVERY` through return/failure states | `OUT_FOR_DELIVERY` |
| `DELIVERED` | `DELIVERED` |
| `CANCELLED` | `CANCELLED` |

This allows current customer tracking, mobile code, reporting, and existing tests to continue operating while clients migrate to the delivery API.

## Event recording

Every job creation, job transition, offer, acceptance, rejection, expiry, cancellation, or reassignment should produce a `DeliveryEvent`.

Phase 0 records all synchronous workflow events. Automatic expiry currently updates the assignment during rider-workspace retrieval; a later notification-worker phase should own scheduled expiry and event publication.
