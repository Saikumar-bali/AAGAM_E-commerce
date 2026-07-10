# Delivery API Contract

Branch: `phase-0-delivery-domain-foundation`

Base controller: `/orders/dispatch`

Authentication: JWT

## Canonical response concepts

### Delivery job

```json
{
  "id": "delivery-job-id",
  "orderId": "order-id",
  "status": "WAITING_FOR_DISPATCH",
  "currentRiderId": null,
  "version": 0,
  "order": {},
  "assignments": [],
  "createdAt": "2026-07-10T18:00:00.000Z",
  "updatedAt": "2026-07-10T18:00:00.000Z"
}
```

### Assignment

```json
{
  "id": "assignment-id",
  "deliveryJobId": "delivery-job-id",
  "riderProfileId": "rider-profile-id",
  "status": "OFFERED",
  "offeredAt": "2026-07-10T18:01:00.000Z",
  "expiresAt": "2026-07-10T18:02:00.000Z",
  "respondedAt": null,
  "rejectionReason": null
}
```

## Dispatch board

### `GET /orders/dispatch/board`

Roles: `ADMIN`, `STORE_OWNER`

Store owners receive only jobs belonging to their stores.

Response:

```json
{
  "waitingJobs": [],
  "activeJobs": [],
  "completedJobs": [],
  "openOffers": [],
  "riders": [],
  "waitingForRider": [],
  "activeDeliveries": []
}
```

`waitingForRider` and `activeDeliveries` are temporary compatibility fields. New clients must use `waitingJobs` and `activeJobs`.

The board lazily backfills delivery jobs for existing legacy orders in `PACKED`, `RIDER_ASSIGNED`, or `OUT_FOR_DELIVERY` state.

## Rider workspace

### `GET /orders/dispatch/rider/workspace`

Role: `RIDER`

Response:

```json
{
  "rider": {},
  "pendingOffers": [],
  "activeJob": null,
  "assignmentHistory": []
}
```

Only offers addressed to the authenticated rider and that rider's active job are returned.

## Create offer

### `POST /orders/dispatch/jobs/:deliveryJobId/offers`

Roles: `ADMIN`, `STORE_OWNER`

Request:

```json
{
  "riderUserId": "rider-user-id",
  "expiresInSeconds": 60
}
```

Validation:

- `riderUserId` is required.
- expiry is 15–300 seconds; default 60.
- delivery job must be `WAITING_FOR_DISPATCH`.
- rider must be `ONLINE` and have no active delivery.
- no open assignment may already exist for the job.
- a store owner must own the job's store.

Success: `DispatchAssignment` with status `OFFERED`.

Common errors:

- `400` selected user is not a rider
- `403` store ownership failure
- `404` delivery job or rider profile not found
- `409` job no longer waiting, rider unavailable, rider already active, or duplicate offer

## Accept offer

### `PATCH /orders/dispatch/assignments/:assignmentId/accept`

Role: `RIDER`

No request body.

Rules:

- assignment must belong to authenticated rider
- status must be `OFFERED`
- offer must not be expired
- rider must have no other active delivery
- job must still be `WAITING_FOR_DISPATCH`

Atomic success changes:

```text
Assignment.status -> ACCEPTED
DeliveryJob.status -> RIDER_ASSIGNED
DeliveryJob.currentRiderId -> offered rider
Order.status -> RIDER_ASSIGNED
Order.riderId -> offered rider
RiderProfile.status -> BUSY
DeliveryEvent -> ASSIGNMENT_ACCEPTED and JOB_STATUS_CHANGED
```

Duplicate or concurrent acceptance returns `409`; only one request can win.

## Reject offer

### `PATCH /orders/dispatch/assignments/:assignmentId/reject`

Role: `RIDER`

Request:

```json
{
  "reason": "Vehicle issue"
}
```

Rules:

- assignment must belong to authenticated rider
- an `OFFERED` assignment may be rejected directly
- an `ACCEPTED` assignment may be rejected only while job status is still `RIDER_ASSIGNED`
- once travel begins, dispatch/admin exception handling is required

Accepted-assignment rejection atomically returns the job and legacy order to dispatch and makes the rider `ONLINE`.

## Rider travel actions

### `PATCH /orders/dispatch/jobs/:deliveryJobId/en-route-to-store`

Role: `RIDER`

Transition:

```text
RIDER_ASSIGNED -> RIDER_EN_ROUTE_TO_STORE
```

### `PATCH /orders/dispatch/jobs/:deliveryJobId/arrived-at-store`

Role: `RIDER`

Transition:

```text
RIDER_EN_ROUTE_TO_STORE -> RIDER_AT_STORE
```

## Store pickup verification

### `PATCH /orders/dispatch/jobs/:deliveryJobId/pickup-verified`

Roles: `STORE_OWNER`, `ADMIN`

Transition:

```text
RIDER_AT_STORE -> PICKUP_VERIFIED
```

Store ownership is checked.

Phase 0 records verification without OTP/QR. Proof verification is a later phase.

## Start delivery

### `PATCH /orders/dispatch/jobs/:deliveryJobId/out-for-delivery`

Role: `RIDER`

Transition:

```text
PICKUP_VERIFIED -> OUT_FOR_DELIVERY
```

Legacy order becomes `OUT_FOR_DELIVERY`.

## Customer arrival

### `PATCH /orders/dispatch/jobs/:deliveryJobId/arrived-at-customer`

Role: `RIDER`

Transition:

```text
OUT_FOR_DELIVERY -> RIDER_AT_CUSTOMER
```

## Complete delivery

### `PATCH /orders/dispatch/jobs/:deliveryJobId/delivered`

Role: `RIDER`

Optional body:

```json
{
  "proofType": "RIDER_CONFIRMATION",
  "code": "1234",
  "note": "Handed to customer",
  "latitude": 17.72,
  "longitude": 83.32
}
```

Transition:

```text
RIDER_AT_CUSTOMER -> DELIVERED
```

Atomic effects include:

- delivery job terminal state
- legacy order delivered state and timestamp
- delivery event and order compatibility history
- rider status released to `ONLINE`
- existing inventory-finalization ledger behavior

The schema accepts proof fields for compatibility, but customer OTP validation is not claimed in Phase 0.

## Compatibility endpoints

These remain temporarily so existing clients can migrate safely.

### `POST /orders/dispatch/:orderId/assign`

Creates an assignment offer for the packed order. It no longer immediately assigns the rider.

Request:

```json
{
  "riderUserId": "rider-user-id"
}
```

### `PATCH /orders/dispatch/:orderId/rider/accept`

Finds the authenticated rider's active offer for the order and accepts it.

### `PATCH /orders/dispatch/:orderId/rider/reject`

Rejects the authenticated rider's current offer/accepted assignment for the order.

### `PATCH /orders/dispatch/:orderId/rider/pickup`

Compatibility adapter that advances the accepted job through travel, store arrival, pickup verification, and out-for-delivery. It exists for old mobile/tests and must not be used by new web clients.

### `PATCH /orders/dispatch/:orderId/rider/deliver`

Compatibility adapter that advances an out-for-delivery job through customer arrival and delivery.

## Deprecated endpoint

### `PATCH /orders/assign`

Role: `RIDER`

Always returns `410 Gone`.

Message directs clients to accept an explicit assignment offer.

## Generic order status endpoint

### `PATCH /orders/:id/status`

Rider role is removed. Only admin and store-owner order operations remain, subject to existing order-service permissions.

Delivery clients must use explicit dispatch endpoints.

## Error behavior

- `400 Bad Request`: malformed DTO or invalid state transition
- `403 Forbidden`: role/resource ownership violation
- `404 Not Found`: missing order, job, assignment, or rider profile
- `409 Conflict`: stale version, duplicate offer, duplicate answer, expired offer, busy rider, or concurrent mutation
- `410 Gone`: removed rider self-assignment route

## Versioning and migration note

The canonical paths are introduced without a `/v2` prefix because this repository is not yet a public stable API. Compatibility routes and response fields should be removed only after web and mobile clients migrate and contract tests prove no remaining consumer depends on them.
