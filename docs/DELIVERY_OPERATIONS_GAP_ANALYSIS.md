# Delivery Operations Gap Analysis

Branch: `phase-0-delivery-domain-foundation`

## Purpose

This document records the delivery-domain problems found on `main` before Phase 0 and the corrections introduced by this branch. It intentionally stops before service-worker notifications, mobile background tracking, COD settlement, rider earnings, and automatic dispatch.

## Main-branch gaps

### 1. Delivery ownership stopped at store packing

The customer could place an order and the store could progress it to `PACKED`, but the next operational steps were represented only by loose order-status mutations. There was no dedicated delivery aggregate that could own assignment, rider movement, pickup, failure, return, and delivery history.

### 2. Two competing assignment paths existed

The repository had both:

- dispatcher assignment through `/orders/dispatch/:orderId/assign`
- rider self-assignment through `/orders/assign`

The self-assignment path accepted `CONFIRMED`, `PICKING`, and `PACKED` orders. This allowed riders to take work before a store completed packing.

### 3. Rider queue leaked unready orders

`GET /orders/rider/queue` returned unassigned `CONFIRMED`, `PICKING`, and `PACKED` orders to every rider. The rider UI treated the first visible order as an active delivery, even when no assignment existed.

### 4. Assignment acceptance was not a separate state

Assigning a rider immediately changed the order to `RIDER_ASSIGNED` and marked the rider `BUSY`. A separate, expiring offer did not exist. Acceptance and rejection were recorded only as order-history notes.

### 5. Concurrency guarantees were incomplete

The application checked for active rider work before assignment, but no database constraint guaranteed:

- one open assignment offer per delivery job
- one active delivery job per rider
- one winner when duplicate acceptance requests arrive concurrently

### 6. OrderStatus was carrying delivery details

`OrderStatus` represented customer payment, store preparation, dispatch, transit, and delivery. It could not express operational states such as rider travelling to store, rider at store, pickup verified, rider at customer, failed delivery, or return to store.

### 7. Generic rider status mutation was exposed

A rider could call `PATCH /orders/:id/status`. Even with service-level checks, this kept a broad mutation surface instead of explicit delivery actions.

### 8. Rider web UX showed misleading information

The rider page:

- displayed a public order queue
- accepted orders through the deprecated self-assignment API
- used order value as rider earnings
- mixed job discovery and active delivery state
- provided generic status buttons instead of role-safe workflow actions

### 9. Audit history was not delivery-specific

Order history stored some delivery notes, but there was no immutable delivery-event stream with job and assignment identifiers.

## Phase 0 corrections

### Canonical domain models

Phase 0 introduces:

- `DeliveryJob`
- `DispatchAssignment`
- `DeliveryEvent`

`Order` remains the customer-facing commercial record. `DeliveryJob` becomes the operational delivery record.

### Canonical services

Phase 0 introduces:

- `DeliveryJobService`
- `DispatchAssignmentService`
- `DeliveryWorkflowService`
- `DeliveryEventService`

The existing `DispatchService` is now a compatibility facade over those services.

### Assignment offer lifecycle

A dispatcher now creates an `OFFERED` assignment. The rider must accept it before the job becomes `RIDER_ASSIGNED` and before the rider becomes `BUSY`.

### Explicit rider actions

The API provides named actions:

- accept/reject assignment
- start trip to store
- mark arrival at store
- start delivery after store verification
- mark arrival at customer
- confirm delivered

The generic rider order-status endpoint is removed from rider authorization.

### Database concurrency protection

The migration adds PostgreSQL partial unique indexes:

- one assignment in `CREATED`, `OFFERED`, or `ACCEPTED` per delivery job
- one non-terminal delivery job per `currentRiderId`

Acceptance additionally uses a serializable transaction, conditional assignment update, job status/version comparison, and row-count validation.

### Backward compatibility

During migration:

- legacy `Order.status`, `Order.riderId`, and timestamps are synchronized with delivery transitions
- the dispatch board still returns `waitingForRider` and `activeDeliveries`
- order-ID dispatch routes remain as adapters
- existing tracking continues to read legacy order fields

New clients should use delivery-job and assignment identifiers.

### Professional web UX

Admin dispatch now shows:

- waiting delivery jobs
- pending offers
- rider availability
- active delivery states
- timed offer creation

Rider workspace now shows:

- offers addressed only to that rider
- acceptance countdown
- one active delivery
- explicit operational actions
- store handoff verification state
- real assignment history instead of fake earnings

## Deliberately deferred

The following belong to later phases:

- service-worker web push and notification outbox
- mobile rider workflow migration
- background GPS and customer live map
- pickup OTP/QR and delivery OTP
- proof photos/signatures
- failed-delivery reason model and retries
- COD collection and settlement
- rider earnings and payouts
- automatic rider recommendation/dispatch
- rider KYC, shifts, zones, and capacity

## Merge rule

Do not merge this branch until:

1. Prisma schema validation passes.
2. All migrations apply to a clean PostgreSQL database.
3. Existing tests pass.
4. Phase 0 state, role, duplicate, concurrency, and invalid-transition tests pass.
5. Turbo build passes.
6. Manual admin/store/rider/customer scenarios in `DELIVERY_PHASE_0_SCENARIO_TESTING.md` are completed.
