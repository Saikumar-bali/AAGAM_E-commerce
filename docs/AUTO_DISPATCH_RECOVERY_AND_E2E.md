# Automatic Rider Dispatch Recovery and E2E Proof

## Scope

This change closes the rider-dispatch recovery gaps found after the mobile pickup and delivery-proof work was merged.

The normal production path remains automatic:

1. Store marks an order ready.
2. The order becomes `PACKED`.
3. A `DeliveryJob` is created in `WAITING_FOR_DISPATCH`.
4. The nearest fresh, available Rider inside the pickup radius receives a timed offer.
5. Acceptance assigns the Rider and marks the Rider `BUSY`.

Admin assignment remains an operational fallback rather than the normal path.

## Recovery behavior

### Rider becomes available after an order is waiting

A Rider transition from `OFFLINE` to `ONLINE` immediately scans waiting jobs. The notification worker also performs a recurring sweep, so waiting jobs recover even if the availability event or application request is interrupted.

### Delivery failure requires another Rider

A `REASSIGN_RIDER` failure resolution returns the job to `WAITING_FOR_DISPATCH`. The recurring worker sweep detects that job and sends a new automatic offer without requiring an administrator to select a Rider.

### Rejected and expired offers

Rejected offers continue to invoke immediate redispatch. Expired offers are reconciled by the notification worker, which then tries the next eligible Rider. A Rider who rejected or missed an offer becomes retryable after the configured cooldown.

## Candidate safety rules

An automatic offer is created only when the Rider:

- is `ONLINE`;
- has latitude and longitude;
- has a fresh dedicated availability-location record;
- is within the configured pickup radius;
- has no active delivery;
- has no other open assignment offer;
- has not been tried during the configured cooldown.

The selected Rider is re-read inside the serializable offer transaction. Availability, location freshness, distance, active delivery, open offers, delivery state, and competing assignments are checked again before insertion. A PostgreSQL partial unique index provides the final concurrency guarantee that one Rider cannot hold two simultaneous `OFFERED` assignments.

## Rider location heartbeat

The Partners app refreshes the Rider's dedicated availability location every 60 seconds while the Rider is online. This uses the authenticated `PATCH /riders/me/status` endpoint and stores a server-received timestamp independently from `RiderProfile.updatedAt`.

During an active delivery, the same heartbeat updates coordinates but cannot overwrite the server-owned `BUSY` state. Existing live-delivery pings also update the canonical RiderProfile coordinates.

If the heartbeat stops, the backend excludes the Rider after the freshness window rather than offering work using stale coordinates. Status changes and heartbeats are serialized with a PostgreSQL advisory lock; a heartbeat carries an explicit marker and can never reactivate a Rider after an OFFLINE transition.

## Rider status API rules

Rider self-service accepts only:

```text
ONLINE
OFFLINE
```

`BUSY` remains server-controlled for normal Rider clients. The API also:

- validates latitude and longitude ranges;
- requires coordinates as a pair;
- correctly accepts zero-valued coordinates;
- requires a location before first going online;
- blocks going offline while an active delivery exists;
- preserves `BUSY` when an online heartbeat arrives during an active delivery.

Administrators retain the ability to set `ONLINE`, `OFFLINE`, or `BUSY`, subject to the active-delivery offline guard.

## Production configuration

```env
AUTO_DISPATCH_ENABLED=true
AUTO_DISPATCH_MAX_PICKUP_KM=8
AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS=180
AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS=300
AUTO_DISPATCH_RECONCILE_LIMIT=50
AUTO_DISPATCH_OFFER_EXPIRY_SECONDS=60
NOTIFICATION_WORKER_DISABLED=false
NOTIFICATION_WORKER_INTERVAL_MS=10000
```

Defaults are applied when the optional numeric variables are absent. Test mode keeps auto-dispatch disabled unless `AUTO_DISPATCH_ENABLED=true` is explicitly set.

## Admin dispatch board

The admin board now distinguishes a genuinely unoffered waiting job from a job with an active automatic offer. It displays:

- open automatic-offer count;
- selected Rider;
- offer countdown;
- reconciliation state after expiry;
- locked manual assignment while an offer is active.

The board silently refreshes every eight seconds. Manual assignment remains available when no open offer exists.

## E2E coverage

`auto-dispatch-recovery.e2e.spec.ts` proves against PostgreSQL that:

- the nearest fresh online Rider is selected;
- offline, busy, stale, and outside-radius Riders are excluded;
- going online wakes a waiting job immediately;
- a fresh heartbeat makes a stale Rider eligible again;
- unrelated profile updates do not refresh location eligibility;
- stale in-flight heartbeats cannot reactivate an offline Rider;
- capped sweeps skip jobs that already have active offers;
- the notification-worker sweep recovers waiting and reassigned jobs;
- a Rider with an active delivery cannot go offline;
- an expired Rider becomes retryable after cooldown;
- concurrent jobs cannot create two open offers for the same Rider.

`auto-dispatch-recovery.contract.spec.ts` verifies:

- DTO validation;
- zero-coordinate support;
- radius and freshness configuration;
- transaction-time revalidation;
- waiting-job worker recovery;
- mobile heartbeat wiring;
- admin open-offer presentation.

The dedicated workflow also reruns the established dispatch, mobile delivery, pickup proof, OTP, COD, and delivery UI contracts, then builds the API, Partners app, and admin dashboard.

## Operational acceptance

A release is accepted only when:

- all automatic-dispatch recovery tests pass on a freshly migrated PostgreSQL database;
- the full API build passes;
- Partners typecheck and tests pass;
- admin production build passes;
- existing pickup, OTP, COD, failure, and delivery proof contracts remain green;
- the PR has no unresolved review threads;
- Codex approves the exact final head commit.
