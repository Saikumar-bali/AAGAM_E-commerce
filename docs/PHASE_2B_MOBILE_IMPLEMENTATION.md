# Phase 2B — Mobile Consolidation and Delivery Implementation

Branch: `phase-2b-mobile-consolidation-delivery`

Base: `4633871b2f0c9cd7885bfb9f8748a9e4007b01fe`

## Final mobile product boundary

```text
AAGAM Customer
└── CUSTOMER

AAGAM Partners
├── RIDER
├── STORE_OWNER
└── ADMIN (limited mobile operations)

Shared package
└── auth, API client, push lifecycle, location/map utilities
```

The obsolete `apps/mobile-app` tree is removed. It must not be restored.

## Rider source of truth

The Partners rider workspace uses only:

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

The following are forbidden in Partners source and CI checks for them:

```text
/orders/rider/queue
/orders/assign
joinRidersQueue
joinRiderZone
newOrderNearby
```

## Delivery action matrix

| Current job status | Rider action | Next status |
|---|---|---|
| `RIDER_ASSIGNED` | Start trip to store | `RIDER_EN_ROUTE_TO_STORE` |
| `RIDER_EN_ROUTE_TO_STORE` | Arrived at store | `RIDER_AT_STORE` |
| `RIDER_AT_STORE` | None; wait for owning store | `PICKUP_VERIFIED` by store |
| `PICKUP_VERIFIED` | Start customer delivery | `OUT_FOR_DELIVERY` |
| `OUT_FOR_DELIVERY` | Arrived at customer | `RIDER_AT_CUSTOMER` |
| `RIDER_AT_CUSTOMER` | Confirm delivery | `DELIVERED` |

Only the next valid action is rendered.

## Offer behavior

- offers are addressed to the authenticated rider profile;
- countdown uses the server `expiresAt` value;
- expired/answered offers are not actionable;
- acceptance is assignment-ID based;
- rejection records a reason;
- one active delivery per rider remains enforced in PostgreSQL and service logic.

## Mobile push

All new mobile registrations use:

```text
POST /notifications/push/subscriptions
provider: FCM_MOBILE
```

The shared lifecycle:

- requests notification permission;
- registers one token per device;
- re-registers rotated tokens;
- refreshes the rider workspace on foreground/open events;
- deactivates only the current device before logout;
- does not log raw FCM tokens.

## Tracking architecture

### Client

`RiderTrackingManager` owns one watcher per active delivery.

It provides:

- no watcher before assignment acceptance;
- status-based send cadence;
- retry-safe `clientPingId`;
- monotonic sequence number;
- captured timestamp;
- last accuracy and send time;
- persistent AsyncStorage queue;
- ordered retry after connectivity returns;
- terminal-state shutdown.

### Server

`TrackingService` treats `DeliveryJob` as authoritative.

It verifies:

- rider profile exists;
- job belongs to that rider;
- job is in a trackable state;
- terminal jobs cannot accept pings;
- captured timestamp is reasonable;
- sequence is newer than the latest mobile sequence;
- impossible speed jumps are rejected.

Duplicate retry protection uses a PostgreSQL transaction-scoped advisory lock keyed by rider and `clientPingId`, followed by an exact source lookup. This preserves compatibility with the existing `RiderLocationPing` table without introducing a migration only for client retry metadata.

`startTracking` and `stopTracking` no longer mutate order or delivery status. Delivery transitions remain exclusively in the DeliveryJob workflow.

## Tracking cadence

| Delivery state | Minimum client interval |
|---|---:|
| Assigned / travelling to store / at store | 20 seconds |
| Pickup verified | 12 seconds |
| Out for delivery / at customer | 8 seconds |

GPS distance filtering remains enabled to reduce noise and battery use.

## Test architecture

### API integration

`phase2b-mobile-delivery.spec.ts` proves:

- addressed offer isolation;
- wrong-rider denial;
- expired acceptance denial;
- single active job;
- start/stop state neutrality;
- duplicate ping suppression;
- out-of-order rejection;
- wrong-rider tracking denial;
- full explicit delivery sequence;
- store pickup gate;
- terminal ping rejection.

### Partners unit tests

- `riderWorkspace.spec.ts` tests action, expiry, cadence, and terminal rules.
- `RiderTrackingManager.spec.ts` tests watcher uniqueness, sequence IDs, cadence, offline queue retry, terminal stop, and GPS failure behavior.

### CI

CI now requires:

- monorepo build including `@aagam/mobile-shared` and `AagamPartners`;
- full service tests against PostgreSQL 16;
- focused Partners tests;
- obsolete-path rejection;
- absence of `apps/mobile-app`;
- Android debug APK build;
- CodeQL and CodeQL Advanced.

## Android background capability

The JavaScript watcher is reliable while the React Native process is active. Android can restrict or stop JavaScript after prolonged backgrounding, process removal, or OEM battery optimization.

Do not claim killed-process tracking from permissions alone. Physical-device Scenario M in `PHASE_2B_MOBILE_SCENARIO_TESTING.md` is the acceptance authority. If it reports `PARTIAL` or `FAIL`, the next hardening step is a native Android foreground location service that owns network delivery independently of the JavaScript process.

## Commands

```bash
npm install
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run test:phase2b --workspace=apps/api-gateway
npm run test:phase2b --workspace=AagamPartners
npm test
npx turbo build --force
npm run build:partners
cd apps/mobile-partners/android
./gradlew assembleDebug --no-daemon --stacktrace
```

## Merge gate

Do not merge while the PR is draft. Complete the automated and manual gates in `PHASE_2B_MOBILE_SCENARIO_TESTING.md`, including physical-device background behavior and real FCM notification-open proof.
