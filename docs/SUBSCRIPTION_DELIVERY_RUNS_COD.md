# Subscription Delivery Runs and COD Cash Control

## Release scope

This release adds dynamic customer subscriptions for recurring essentials while preserving AAGAM's existing order, delivery-job, proof, COD-ledger, notification, tracking, inventory, and audit systems as the operational source of truth.

The supported funding models are:

- **Full-plan cash funding:** collect the full 7-day or 30-day amount during the first verified delivery. Later deliveries are represented as `SUBSCRIPTION_CASH_CREDIT` with customer amount due ₹0.
- **Weekly cash funding:** collect cash for the next seven eligible deliveries on the funding delivery. Later deliveries in the funded range have customer amount due ₹0.

Daily COD plus daily OTP is intentionally not the normal subscription workflow.

## Architecture

The authoritative chain is:

```text
SubscriptionPlan
  -> SubscriptionPlanVersion
  -> CustomerSubscription
  -> SubscriptionDelivery
  -> Order (orderSource=SUBSCRIPTION)
  -> DeliveryJob
  -> DeliveryRunStop
  -> existing pickup / proof / COD / failure / tracking / notification systems
```

A subscription creates a deterministic calendar, not a month of orders. The scheduler generates each real order near its service window using a unique generation key and serializable transaction. Inventory is reserved only for the generated occurrence. Future demand is exposed separately to stores and admins.

Normal checkout and subscription generation both use `OrderCreationService` for store resolution inputs, authoritative product pricing snapshots, atomic inventory reservation, inventory-ledger writes, order/payment creation, status history, delivery-job creation, and notification outbox events.

## Database changes

Migration: `packages/database/prisma/migrations/20260806090000_subscription_delivery_runs_cod/migration.sql`

### New immutable and operational models

- `SubscriptionPlan`
- `SubscriptionPlanItem`
- `SubscriptionPlanVersion`
- `SubscriptionPlanStore`
- `SubscriptionPlanZone`
- `CustomerSubscription`
- `SubscriptionDelivery`
- `SubscriptionFundingAllocation`
- `DeliveryRun`
- `DeliveryRunStop`
- `CashDepositBatch`
- `CashDepositBatchEntry`
- `CashDepositAuditEntry`
- `SubscriptionIssueReport`
- `SubscriptionAuditEntry`

### Existing-model additions

`Order` now carries:

- `orderSource`
- `subscriptionId`
- `subscriptionDeliveryId`
- `scheduledDeliveryDate`
- delivery-window timestamps
- subscription sequence metadata

`PaymentMethod` adds `SUBSCRIPTION_CASH_CREDIT` and `PaymentStatus` adds `SUBSCRIPTION_FUNDED`.

`DeliveryProof` supports OTP, trusted drop, and security/reception proof references. The existing individual `CodLedger` remains authoritative and is linked to funding allocations and deposit-batch entries.

### Data integrity

The migration adds:

- unique plan code;
- immutable `(planId, version)` versions;
- unique subscription occurrence per service date and sequence;
- unique generation key;
- unique order and delivery-job linkage;
- unique run route code;
- unique run sequence numbers;
- unique stop linkage to one delivery job and one subscription delivery;
- unique deposit batch per delivery run;
- one deposit-batch entry per individual COD ledger;
- idempotency uniqueness for funding, issue, audit, and correction operations;
- foreign keys with `Restrict`, `SetNull`, or `Cascade` selected according to audit-retention requirements;
- indexes for scheduler, customer, store, rider, route, cash, and exception queries.

The migration is forward-only and does not drop, truncate, or rewrite existing order/payment data.

## Plan publishing and contract immutability

Admin plan edits update only the editable plan definition. Publishing creates a new `SubscriptionPlanVersion` snapshot containing:

- price and MRP in integer paise;
- products and quantities;
- delivery count and duration;
- funding cycle and recurrence;
- skip and pause rules;
- proof requirements;
- delivery windows;
- store and zone applicability.

Every `CustomerSubscription` references one immutable plan version and stores price, item, address, and policy snapshots. Later plan edits cannot silently change an existing subscriber contract.

## Scheduler and order generation

`SubscriptionSchedulerService` runs at a configurable interval:

- `SUBSCRIPTION_SCHEDULER_ENABLED` — defaults to `true`, disabled in test mode.
- `SUBSCRIPTION_SCHEDULER_INTERVAL_MS` — defaults to 15 minutes, minimum one minute.

Each tick:

1. selects due scheduled occurrences;
2. excludes paused, skipped, cancelled, completed, and ineligible occurrences;
3. validates the current entitlement and serviceability;
4. resolves an applicable active store;
5. acquires a PostgreSQL advisory transaction lock;
6. changes the occurrence to `GENERATING`;
7. creates one normal AAGAM order through `OrderCreationService`;
8. reserves only that occurrence's inventory;
9. creates or links the delivery job;
10. marks the occurrence `ORDER_GENERATED`;
11. groups generated jobs into practical store/date/slot/cluster delivery runs and ordered stops.

Repeated scheduler executions are safe because the generation key, order idempotency key, occurrence state, advisory lock, and database uniqueness constraints jointly prevent duplicate orders.

## Cash funding and delivery completion

The high-risk completion path uses one serializable database transaction:

1. lock and validate the current run, stop, delivery job, occurrence, and subscription;
2. validate version and allowed server-side transitions;
3. validate OTP or trusted-drop proof requirements;
4. validate exact cash amount when cash is due;
5. create/update the existing individual COD ledger and immutable ledger entry;
6. allocate full-plan or weekly funding to a sequence range;
7. update the subscription amount collected and funded-delivery counts;
8. consume exactly one funded entitlement for the delivered occurrence;
9. create the existing delivery proof and finalize the delivery job/order;
10. complete the run stop and recalculate run counters and cash totals.

A retry with the same idempotency key returns the committed result and cannot collect cash or consume entitlement twice.

Subsequent funded deliveries use `SUBSCRIPTION_CASH_CREDIT` and clearly expose:

```text
Customer amount due: ₹0
Subscription already funded
Do not collect cash
```

## Delivery proof rules

- **Personal handover:** customer OTP plus rider GPS.
- **Security/reception:** OTP plus GPS and handover note/proof reference.
- **Trusted drop:** assigned rider, GPS/geofence validation, secure drop token, proof reference/photo identifier, quantity confirmation, timestamp, and idempotency.

Cash collection always requires exact expected cash and a valid customer OTP, even when the normal handover preference is trusted drop.

No API supports bulk delivery completion. Every route stop is independently arrived, verified, completed, failed, retried, reordered, or returned.

## Store and rider handoff

Store preparation exposes route totals, product totals, customer bag lists, packing progress, and exceptions.

Handoff is deliberately split:

1. store confirms route packing, expected bag count, optional crate QR/code, and any exception note;
2. store confirms handoff;
3. rider independently counts the bags and confirms receipt using the expected count and crate code;
4. only then can the rider start the run.

This avoids a single actor marking both sides of custody.

## Failure, retry, return, and extension behavior

The run service uses the existing delivery-failure decision engine. Client-provided final states are not trusted.

- Retry decisions move the same job/stop to `RETRY_PENDING` and retain the unresolved route obligation.
- Return-required failures keep the run unresolved until the owning store records physical return.
- Final failed subscription occurrences do not consume funded entitlement.
- `EXTEND_PLAN` creates one deterministic replacement occurrence at the end of the calendar, preserving sequence/date uniqueness.
- Retry attempts do not inflate the customer's final failed-delivery count.
- A run cannot finish while retry or return requirements remain unresolved.

## Cash deposit and variance control

At route return:

1. rider selects eligible held individual COD ledgers;
2. the server derives the expected amount from ledger data;
3. rider submits the physical amount;
4. store owner independently counts and verifies it;
5. every included COD ledger receives an immutable deposit entry and linked `CashDepositBatchEntry` allocation;
6. exact payment settles the batch and updates run deposited cash;
7. a difference creates `VARIANCE_REVIEW`;
8. admin resolution requires a reason and a compensating immutable ledger/audit entry.

The route-level batch never replaces individual COD ledgers. Rider holding balance remains derived from ledger entries rather than an editable total.

## API surface

### Public/customer

- `GET /subscriptions/plans`
- `GET /subscriptions/plans/:idOrCode`
- `POST /subscriptions/plans/:planId/quote`
- `POST /customer/subscriptions`
- `GET /customer/subscriptions`
- `GET /customer/subscriptions/:id`
- `GET /customer/subscriptions/:id/deliveries`
- `POST /customer/subscriptions/:id/deliveries/:deliveryId/skip`
- `POST /customer/subscriptions/:id/pause`
- `POST /customer/subscriptions/:id/resume`
- `PATCH /customer/subscriptions/:id/preferences`
- `POST /customer/subscriptions/:id/cancel`
- `GET /customer/subscriptions/:id/tracking`
- `POST /customer/subscriptions/:id/deliveries/:deliveryId/issues`

### Rider

- `GET /rider/delivery-runs/today`
- `GET /rider/delivery-runs/:runId`
- `POST /rider/delivery-runs/:runId/pickup`
- `POST /rider/delivery-runs/:runId/start`
- `POST /rider/delivery-runs/:runId/stops/:stopId/arrive`
- `POST /rider/delivery-runs/:runId/stops/:stopId/otp`
- `POST /rider/delivery-runs/:runId/stops/:stopId/complete`
- `POST /rider/delivery-runs/:runId/stops/:stopId/fail`
- `POST /rider/delivery-runs/:runId/stops/:stopId/reorder`
- `POST /rider/delivery-runs/:runId/finish`
- `GET /rider/delivery-runs/:runId/cash-accountability`
- `POST /rider/delivery-runs/:runId/cash-batches`
- `POST /rider/delivery-runs/cash-batches/:batchId/submit`

### Store

- `GET /store/subscription-operations/demand`
- `GET /store/subscription-operations/runs`
- `GET /store/subscription-operations/exceptions`
- `GET /store/subscription-operations/cash-batches`
- `POST /store/subscription-operations/runs/:runId/packing`
- `POST /store/subscription-operations/runs/:runId/pickup`
- `POST /store/subscription-operations/runs/:runId/stops/:stopId/return`
- `POST /store/subscription-operations/cash-batches/:batchId/verify`

### Admin

- plan CRUD, publish, pause, activate, archive;
- subscriber and immutable contract details;
- delivery calendar;
- run planning and assignment;
- cash control and variance resolution;
- exceptions and issue resolution;
- analytics;
- audited compensating corrections;
- controlled scheduler execution.

Every non-public endpoint uses JWT plus role guards, and services independently verify customer ownership, store ownership, rider assignment, route version, and resource linkage.

## UI surfaces

### Customer web and Android

- dynamic “Subscribe & Save” discovery;
- product-level buy-once versus subscription entry;
- plan selection and review;
- explicit first/weekly cash amount and later-delivery ₹0 disclosure;
- requested-state confirmation rather than false prepaid activation;
- active/upcoming/paused/completed subscriptions;
- delivery progress, funded balance, next delivery, next cash collection, history and receipts;
- existing order tracking reuse;
- skip, pause, resume, preference update, cancellation and issue reporting with confirmation and toast feedback.

### Rider web and Android

- dedicated morning-runs navigation;
- route summary, stop progress, map/list-ready stop data, current cash holding;
- independent pickup receipt;
- individual arrival, OTP/proof, exact cash collection, completion, failure, retry, reorder and route finish;
- cash accountability and deposit-batch submission.

### Store web and Android

- demand forecast;
- preparation routes, item totals and customer bag lists;
- route packing, crate/bag verification and handoff;
- return exceptions;
- expected rider cash, independent batch verification and variance recording.

### Admin web

- plan lifecycle and bundle configuration;
- subscribers, delivery calendar, routes, cash control, exceptions and analytics;
- controlled audited corrections.

The interfaces use the existing AAGAM green/teal identity, accessible touch targets, skeleton/loading states, empty states, confirmation dialogs/bottom sheets, sticky primary actions, and user-safe toast errors.

## Security decisions

- Integer paise only for all new monetary fields and calculations.
- Serializable transactions for order generation, delivery/cash completion, settlement, and corrections.
- PostgreSQL advisory locks plus unique idempotency keys for scheduler and mobile retries.
- Optimistic route and stop versions reject stale offline replay.
- Server-owned state transition tables; no client-supplied final status is accepted.
- Resource ownership is rechecked in services, not only controllers.
- Exact expected cash is validated server-side.
- OTP operations are single-use and linked to the current delivery job.
- Trusted-drop token is stored as a hash, never returned in plaintext.
- Immutable plan, address, price, item, proof, COD, deposit, and correction snapshots preserve audit history.
- No bulk “mark all delivered” operation exists.

## Tests and proof

Added coverage includes:

- deterministic daily, alternate-day, weekday, selected-weekday, weekly and custom calendars;
- exact integer-paise occurrence and weekly funding allocation;
- migration and schema contracts;
- shared order creation and one-order-per-occurrence contracts;
- atomic proof/COD/funding/stop completion contracts;
- no bulk completion contract;
- independent store/rider custody contract;
- individual-ledger cash-batch contract;
- customer, rider, store and admin surface contracts;
- Playwright role flows and screenshots through `apps/admin-dashboard/tests/subscription-delivery-runs-ui.spec.ts`.

Expected exact-head validation:

- `npm ci`
- Prisma client generation and schema validation
- forward migration on PostgreSQL 16
- workspace builds
- API service tests
- Playwright role flows and screenshot artifact
- customer Android typecheck/tests and APK workflow
- partners Android typecheck/tests and APK workflow
- production UX contracts
- CodeQL

CI evidence and final commit SHAs are recorded in the pull request after the exact-head runs finish.

## Deployment and migration notes

1. Back up the production database.
2. Deploy application code and run `prisma migrate deploy` through the existing release workflow.
3. Keep `SUBSCRIPTION_SCHEDULER_ENABLED=false` during the first migration-only deployment if operations wants a controlled activation window.
4. Verify new tables, indexes, and enum values.
5. Publish at least one plan through admin; drafts do not appear publicly.
6. Enable the scheduler and observe generated occurrence, order, delivery-job, and run counts.
7. Verify one full-plan and one weekly-funding route in a controlled store before broad activation.

Existing checkout orders and COD ledgers remain backward compatible because new fields are nullable or have safe defaults.

## Rollback

Application rollback is safe before plans are published because all changes are additive.

After live subscription data exists:

1. disable `SUBSCRIPTION_SCHEDULER_ENABLED`;
2. pause active plans through admin;
3. allow already generated normal orders and delivery jobs to finish through existing operations;
4. deploy the previous application version only if it tolerates the additive enum values and nullable columns;
5. do **not** drop subscription or cash-audit tables as an emergency rollback;
6. preserve immutable plan versions, occurrence history, COD ledgers, deposit entries, and audit records;
7. use a reviewed follow-up migration for any schema reversal after data export and reconciliation.

## Merge gate

This change must not merge until the exact PR-head commit has all required builds, tests, web validation, Android validation, security checks and required reviews green, the branch is current with `main`, and no review thread remains unresolved.
