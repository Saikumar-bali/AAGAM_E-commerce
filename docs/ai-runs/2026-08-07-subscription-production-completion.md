# Subscription Production Completion — 2026-08-07

Issue: #219
PR: #220
Base main: `24c8f4d01733e3046408cfbfedd157df4f4b6ce0`

## Scope completed

This change closes the production-readiness gaps left after the initial subscription-delivery and regional-routing foundations. It intentionally extends the existing order, delivery-job, COD, notification, upload, Admin, Customer, Store, and Rider architecture rather than creating parallel systems.

### Serviceability and time

- One shared subscription serviceability resolver is used by quote/create/order generation.
- Delivery zones own an IANA timezone (`Asia/Kolkata` default) and immutable resolution snapshots carry the timezone.
- Business dates remain date anchors; delivery-window instants are converted from zone-local wall time to UTC.
- Overnight windows are supported; equal start/end is rejected.
- DST-sensitive conversion is covered with New York winter/summer assertions.
- Zone slots, slot-end safety buffer, store eligibility/radius, inventory, capacity, plan-zone/store applicability, and product weight are enforced through the same resolver.

### Durable generation and routing

- Production subscription scheduling uses Redis/BullMQ repeatable jobs rather than process-local `setInterval` execution.
- Retry/backoff, stalled-job recovery, timeout protection, terminal failure persistence, admin notification, readiness, and deterministic manual execution are included.
- Generation attempts are persisted with correlation IDs and typed defer/failure reasons.
- Route clustering keeps the existing regional planner, adds immutable item/run/stop weight snapshots, zone weight ceilings, and the real slot budget (`slot duration - safety buffer`).
- Mixed funded/cash runs are disabled by default through `ALLOW_MIXED_CASH_RUNS=false`; enabling the flag is explicit.
- Manual split/recovery rider selection is revalidated and assigned inside the same Serializable transaction as route mutation. Mutable shift, break, overlap, approval, document, vehicle, parcel/weight, proximity, zone and cash-risk state can therefore roll back the mutation.
- Recovery continues to move pending stops only and preserves protected delivered/cash ownership.

### Trusted Drop security and proof

- Customer-created drop secrets and rider-entered arbitrary proof references are removed from the authoritative path.
- Server-issued challenges use a 256-bit CSPRNG nonce, signed/versioned token format, hashed token persistence, expiry, one-time consumption, subscription/delivery binding, credential rotation/revocation and replay resistance.
- Evidence is a first-class private record bound to exact run stop, delivery job, subscription delivery, rider, challenge and credential version.
- Upload authorization, file-size checks and image magic-byte validation are enforced; object keys remain private and signed URLs are authorization-scoped.
- Arrival and completion geofence measurements are distinct persisted proof records, including fail decisions rather than silently dropping failed checks.
- Funded subscription stops remain zero-cash; COD/OTP/GPS behavior remains on the existing order-delivery path.

### Mobile and operator completion

- Customer Android renders Trusted Drop QR codes on-device and supports issue/rotate/revoke; no third-party QR renderer or customer-selected secret is used.
- Rider Android uses the native scanner and native camera evidence flow.
- Rider connectivity is native; non-secret mutations can be persisted/replayed offline with 400/404/409 conflict separation.
- QR secrets are never persisted in the offline queue. Offline Trusted Drop records only a `rescan required` dependency.
- Durable route assigned/removed and worker-failure notifications use the existing outbox path.
- Admin exposes plan desktop/mobile image upload, zone timezone, route weight/buffer context, typed generation deferrals, cash variance and durable worker failures.

## Database migration

Migration: `20260807130000_subscription_production_completion`

The migration is additive/backward-compatible: new nullable/defaulted columns, enums, proof/audit tables, indexes and foreign keys are added without destructive table rewrites. Window constraints are replaced to permit overnight windows while rejecting equal start/end. Existing delivery/order/COD records remain authoritative.

Rollback policy: application rollback is safe while new columns/tables remain in place. Do not destructively drop proof/audit tables during an incident rollback; retain them for forensic continuity. A later cleanup migration may remove unused fields only after the rolled-back application is retired.

## Security invariants

1. No plaintext Trusted Drop token is persisted.
2. A challenge is one-time, expiring, signed, credential-versioned and exact-delivery scoped when issued for a delivery.
3. A rider cannot complete Trusted Drop with a client-supplied arbitrary proof reference.
4. Evidence belongs to the authenticated assigned rider and exact stop/job/delivery.
5. Arrival and completion geofences are separate measurements.
6. Route mutations recheck mutable rider eligibility inside the committing transaction.
7. Non-admin regional event consumers receive role-scoped events; malformed `after` cursors fail with HTTP 400.
8. QR secrets are not written to offline storage/logging payloads.

## Verification gates

Exact PR-head acceptance requires all of the following on the final commit:

- `npm ci --no-audit --no-fund`
- Prisma generate/validate/migrate-deploy/migrate-status against PostgreSQL 16
- Turbo build
- API CI-safe Jest suite, including subscription production completion contracts
- Admin Playwright smoke suite with subscription/route-planning controls
- CodeQL
- Existing Customer/Partners native verification workflows affected by changed Android paths
- `git diff --check`
- No unresolved PR review threads

The PR must not be merged from a stale or partially-tested SHA. The merge operation must be pinned to the exact green head SHA.
