# Phase 2 — Mobile Delivery and Live Tracking Foundation

Branch: `phase-2-mobile-delivery-live-tracking`

Base commit:

```text
e081c166c4fa42a4eb1e3d8bd1734bbf42f1e005
```

## Objective

Move the rider mobile application from the retired public-order queue and generic order-status mutations to the canonical Phase 0 delivery domain, then make mobile push and rider location tracking reliable enough for customer-facing live delivery.

Phase 2 must preserve the Phase 0/1 guarantees:

- riders see only offers addressed to them
- an offer must be accepted before a rider becomes busy
- one active delivery per rider
- explicit delivery-job transitions only
- notification intent remains transactional and deduplicated
- push or location failures never roll back committed order/delivery state

## Verified current gaps

The current mobile rider application still:

- calls `GET /orders/rider/queue`
- emits `joinRidersQueue` and `joinRiderZone`
- listens for `newOrderNearby`
- accepts work through retired `PATCH /orders/assign`
- calls generic `PATCH /orders/:id/status`
- derives active delivery from legacy order statuses
- registers one FCM token through `/auth/fcm-token`
- polls single GPS fixes instead of managing a clear tracking session

Those paths conflict with the accepted delivery domain and must not be retained as fallbacks.

## Workstream 1 — Canonical mobile delivery API

Replace legacy rider-service methods with:

```text
GET   /orders/dispatch/rider/workspace
PATCH /orders/dispatch/assignments/:assignmentId/accept
PATCH /orders/dispatch/assignments/:assignmentId/reject
PATCH /orders/dispatch/jobs/:deliveryJobId/en-route-to-store
PATCH /orders/dispatch/jobs/:deliveryJobId/arrived-at-store
PATCH /orders/dispatch/jobs/:deliveryJobId/out-for-delivery
PATCH /orders/dispatch/jobs/:deliveryJobId/arrived-at-customer
PATCH /orders/dispatch/jobs/:deliveryJobId/delivered
```

Requirements:

- typed mobile DTOs for workspace, offers, assignments, delivery jobs and transitions
- no mobile calls to `/orders/rider/queue`, `/orders/assign`, or rider generic status mutation
- errors must expose actionable messages for expired offers, wrong rider, stale state and invalid transition
- query-cache invalidation must be based on workspace/assignment/job identifiers

## Workstream 2 — Rider mobile workspace

Replace the public queue UI with two explicit sections:

1. **Addressed offers**
   - store and destination summary
   - offer expiry countdown
   - accept and reject actions
   - rejection reason selection
   - expired offer removed without accepting it

2. **Current delivery**
   - exactly one active job
   - canonical job status
   - next valid action only
   - store navigation and call action
   - customer navigation and call action
   - pickup waiting state until store verification
   - delivery confirmation with proof payload foundation

The screen must never infer rider ownership from the first order in a queue.

## Workstream 3 — Mobile Firebase subscriptions

Migrate device registration to:

```text
POST /notifications/push/subscriptions
provider: FCM_MOBILE
```

Requirements:

- register one row per device token
- include user agent/device label where available
- refresh registration when Firebase rotates the token
- disable the current subscription on logout
- preserve other active devices for the same user
- deep-link assignment offers to the rider workspace
- foreground and background handlers refresh the canonical workspace
- no use of legacy `/auth/fcm-token` for new mobile sessions

## Workstream 4 — Rider tracking session

Create an explicit tracking lifecycle tied to the active `DeliveryJob`:

- no tracking before assignment acceptance
- start lower-frequency location updates while travelling to store
- increase frequency after pickup/out-for-delivery
- stop tracking on delivered, returned or cancelled terminal states
- use `watchPosition` rather than repeated one-shot timers for foreground tracking
- prevent overlapping watchers
- persist last successful send time and GPS accuracy
- retry transient network failures without duplicating state transitions
- expose stale/offline GPS status to the rider

Background-location implementation must be honest:

- Android foreground-service/background-location permission requirements must be documented
- if the current native stack cannot reliably execute JS while backgrounded, add the required native/background-task capability rather than claiming a timer is background tracking
- battery and network trade-offs must be documented

## Workstream 5 — Customer live tracking

Use the existing tracking payload and rider pings to provide:

- customer web live map when an active rider location exists
- customer mobile map or safe coordinate/route fallback
- last-updated timestamp
- stale-location warning
- store, rider and customer markers
- delivery state timeline from `DeliveryJob`
- no map crash when coordinates are absent

Server ETA may be included only when distance inputs are trustworthy; otherwise show a clear unavailable state.

## Workstream 6 — Notification preferences UI

The shared notification center already has a global push toggle. Add a dedicated settings experience for event-level controls:

- order preparation updates
- rider assignment/pickup updates
- out-for-delivery/arrival updates
- delivery completion/failure updates
- administrative broadcasts where role-appropriate

Requirements:

- read existing `/notifications/preferences`
- upsert per-event push/in-app values
- global preference remains the fallback
- critical operational events must be clearly identified if they cannot be fully disabled
- responsive web UI for customer, rider, store and admin roles

## Workstream 7 — Firebase and tracking observability

Add operational diagnostics for:

- active mobile subscriptions by user/device
- last token refresh
- last push delivery attempt and provider error
- last rider location ping and age
- active tracking session state
- invalid/deactivated tokens

Do not log raw FCM tokens, auth secrets, customer phone numbers or full addresses.

## Automated tests

### API/service tests

- mobile workspace returns only addressed offers and current job
- wrong rider cannot accept/reject/transition
- expired offer cannot be accepted
- accepted offer becomes the single active job
- mobile FCM token registration is multi-device and idempotent
- token refresh moves the device safely without duplicating active rows
- logout disables only the current device
- location ping rejected before assignment and after terminal state
- stale location calculation is deterministic

### Mobile tests

- legacy queue/self-assignment functions are absent from rider service
- offer countdown and expiry behavior
- valid action matrix for every delivery state
- tracking watcher starts once and stops on terminal state
- notification-open deep link refreshes the correct workspace
- permission-denied and GPS-disabled states do not crash

### Web tests

- event-level preference page loads/saves
- customer tracking map empty/loading/live/stale states
- role-safe navigation
- mobile-width overflow checks

## Manual acceptance

Use two rider accounts, one customer, one store owner and one admin.

Prove:

1. Rider A receives an addressed offer; Rider B receives nothing.
2. Rider A accepts through the mobile canonical assignment endpoint.
3. Mobile UI follows the full explicit delivery sequence.
4. Foreground location updates appear on customer web tracking.
5. Background/locked-device tracking behavior is tested on a physical Android device and reported honestly.
6. FCM mobile offer notification opens the rider workspace.
7. A second device for the same rider remains registered when the first logs out.
8. Event-specific notification preferences persist and route correctly.
9. Delivery completion stops location tracking and releases the rider.
10. Phase 0 and Phase 1 regression gates remain green.

## Out of scope

Keep these for later phases unless required by a blocking dependency:

- automatic rider recommendation/dispatch
- rider KYC, shifts, zones and capacity planning
- COD cash settlement
- rider earnings and payouts
- proof-photo/signature storage
- advanced failed-delivery retry/return orchestration

## Merge gate

Do not merge Phase 2 until:

- Prisma validation and migrations pass
- full API tests pass
- mobile TypeScript and Android release build pass
- web/admin build passes
- focused Phase 2 tests pass
- Phase 0 and Phase 1 regression tests pass
- physical Android rider workflow is proven
- real FCM mobile notification-open behavior is proven
- foreground live tracking is visible to a customer
- background tracking capability is either proven or explicitly excluded with a technically valid reason
