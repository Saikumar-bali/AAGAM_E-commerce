# Subscription + Regional Routing Release Hardening

## Operating contract

Work only on branch `agent/subscription-release-hardening`, which starts from current `main` commit `961e6cbbbdeb284e89e72b065187aacf7e301c94`.

The branch already contains commit `a1f3ca4e76c7bd50078a0fc77c753b52ed39d2f1`, which forwards `request.user` from `GET /regional-routing/events` into `RegionalRouteOperationsService.events()`. Preserve that fix and add real isolation tests.

Do not merge. Do not bypass tests, weaken guards, disable lint/type checks, replace production logic with mocks, or return success after a committed partial mutation. Inspect the existing implementation before editing. Reuse existing domain services, upload infrastructure, notification infrastructure, idempotency conventions, Prisma transactions, and UI components.

Implement in four reviewable commits. After every commit, run the targeted tests before moving to the next commit.

---

## Commit 1 — security, timezone, and quote serviceability

### 1. Regional event authorization isolation

Primary files:

- `apps/api-gateway/src/subscriptions/regional-routing.controller.ts`
- `apps/api-gateway/src/subscriptions/regional-route-operations.service.ts`
- existing subscription/regional-routing test suites

Requirements:

- Preserve controller forwarding: `this.operations.events(after, request.user)`.
- Fail closed for unsupported/missing actors on the shared endpoint. Only the admin-only endpoint may intentionally request all events.
- Rider events must be restricted to runs currently assigned to that rider.
- Store-owner events must be restricted to runs belonging to stores owned by that user.
- Non-admin event payloads must remain redacted; never expose other route IDs, stop IDs, movement metadata, recovery metadata, coordinates, customer details, or raw audit payloads.
- Invalid `after` timestamps must return 400, not an unbounded event feed.

Required tests:

- Rider A cannot see Rider B events.
- Store owner A cannot see Store B events.
- Admin can see all events.
- Rider/store response payload remains redacted.
- Invalid `after` is rejected.

### 2. Zone-local subscription dates and windows

Primary files:

- `packages/database/prisma/schema.prisma`
- new Prisma migration
- `apps/api-gateway/src/subscriptions/subscription-calendar.service.ts`
- `apps/api-gateway/src/subscriptions/customer-subscription.service.ts`
- `apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts`
- `apps/api-gateway/src/subscriptions/regional-route-planning.service.ts`
- admin/customer/store/rider subscription UI date formatters

Requirements:

- Add an IANA timezone field to `DeliveryZone`, defaulting existing rows to `Asia/Kolkata`. Validate the value with `Intl.DateTimeFormat`; reject invalid zones.
- Treat the zone timezone as the source of truth after zone resolution. Do not use server timezone or device timezone to define a delivery instant.
- Replace `setUTCHours`-style construction with a tested zoned-time helper. Use a proven timezone library already present; if none exists, add `date-fns-tz` to the correct workspace. Do not hand-roll fixed `+05:30` offsets.
- Construct `serviceDate + local minute-of-day + zone timezone`, then store the resulting UTC instant in the database.
- Support windows crossing midnight.
- Return `timezone`, local date, local start/end labels, and UTC instants in API DTOs where needed.
- Admin, customer, store, rider web/mobile surfaces must display `6:00 AM – 8:00 AM IST` consistently by formatting with the supplied IANA timezone. Remove bare `new Date(value).toLocaleTimeString()` where it changes meaning by device locale/timezone.
- Existing records must remain readable. Migration must be backward-compatible.

Required tests:

- `Asia/Kolkata` 06:00–08:00 becomes the correct UTC instants and displays 06:00–08:00 in every role.
- A non-India IANA zone proves the implementation is not hard-coded.
- Midnight-crossing window.
- Invalid timezone rejected.

### 3. Quote-time serviceability gate with generation-time revalidation

Primary files:

- `apps/api-gateway/src/subscriptions/customer-subscription.service.ts`
- `apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts`
- `apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts`
- `apps/api-gateway/src/subscriptions/subscription-calendar.service.ts`
- `apps/api-gateway/src/subscriptions/subscription-plan.service.ts`

Create one reusable serviceability resolver used by both quote/create and actual generation. Do not duplicate subtly different business rules.

Before returning a quote and again before create:

1. Resolve the active delivery zone from authoritative address coordinates.
2. Verify the plan is allowed in that zone (`plan.zones` policy; define whether empty means all active zones and test it).
3. Resolve an applicable active store from explicit plan-store links and/or zone-store links.
4. Verify store distance/service radius and zone applicability.
5. Verify all plan items are listed and initial inventory is sufficient for at least the first delivery. Return item-specific failure reasons, never inventory internals from another store.
6. Forecast zone daily subscription capacity for every generated service date, including existing subscriptions/deliveries and already planned stops.
7. Validate the requested local window against zone delivery slots, route-duration feasibility, and slot-end buffer.
8. Return a stable serviceability snapshot: `zoneId`, `zoneCode`, `timezone`, `storeId`, checked dates, capacity decision, inventory decision, and window UTC/local values.

At actual order generation, re-run the same resolver in a transaction/advisory-lock boundary. If conditions changed, use a typed deferred reason and auditable retry state; never silently generate an operationally impossible order.

Required tests:

- outside active zone;
- plan not available in zone;
- no capable store;
- store too far/unserviceable;
- missing/unlisted/insufficient inventory;
- daily capacity exhausted;
- invalid slot or slot-end buffer breach;
- valid quote and create choose the same zone/store;
- inventory/capacity changed after quote is caught again during generation.

---

## Commit 2 — atomic route operations, weight/slot constraints, mixed-cash policy, reassignment UX

### 4. Split and recovery must be atomic or truthfully partial

Primary files:

- `apps/api-gateway/src/subscriptions/regional-route-operations.service.ts`
- `apps/api-gateway/src/subscriptions/regional-route-planning.service.ts`
- related DTOs and tests

Current defect: split/recovery commits route mutation before requested rider eligibility/assignment.

Implement the atomic option:

- Derive expected post-split/recovery route metrics before mutation.
- Validate every requested rider against the synthetic resulting run: shift coverage, overlapping runs, vehicle, parcel/weight capacity, pickup distance, cash risk, zone preference constraints, active documents, breaks, and status.
- Re-check mutable eligibility inside the same serializable transaction.
- Refactor assignment into a transaction-aware method so route creation/movement and requested assignments commit or roll back together.
- If any rider is invalid or concurrently becomes invalid, no split/recovery route, stop move, audit row, event, or job ownership change may remain committed.
- Preserve optimistic version checks and advisory locks.

Required tests:

- invalid rider leaves source route byte-for-byte operationally unchanged;
- second rider invalid rolls back all split routes;
- recovery rider invalid creates no recovery run;
- concurrent version/eligibility change rolls back;
- successful split/recovery assigns all requested riders and writes audit/events once.

### 6. Enforce weight and slot-end buffer

Primary files:

- Prisma schema/migration if product/stop/run weight is not already explicit
- `regional-routing.geometry.ts`
- `regional-route-planning.service.ts`
- `regional-route-operations.service.ts`
- subscription plan publish/validation and product admin path if weight metadata is absent

Requirements:

- Use authoritative per-unit product weight. If no typed field exists, add a non-negative `weightGrams`/equivalent field and make subscription-plan publication reject products with missing/zero weight when the plan participates in weight-constrained routing.
- Snapshot delivery weight at generation time; do not recalculate historical deliveries from mutable product data.
- Add candidate/run/stop weight metrics as needed for auditability.
- `splitByOperationalConstraints`, preview, manual move/merge/split, and planner must enforce `maximumWeightKg`.
- Enforce `estimatedDurationMinutes <= local slot duration - slotEndBufferMinutes`.
- Error/deferred messages must identify which constraint failed.

Required boundary tests: exact limit passes; one gram/minute over fails; mixed heavy/light route splits correctly; manual merge/move rejected when weight or buffered slot capacity would be exceeded.

### 7. Configurable mixed cash runs

Primary file: `regional-route-planning.service.ts`.

- Add documented `ALLOW_MIXED_CASH_RUNS=true|false`, default `false` for backward-compatible risk isolation.
- When false, retain `CASH_COLLECTION` vs `SUBSCRIPTION_FUNDED` hard grouping.
- When true, omit payment type from the hard-group key and allow mixed routes while still enforcing zone/rider cash limits and preserving stop-level cash accountability.
- Include the effective policy in run `assignmentConstraints`/audit metadata.

Tests: false produces two routes; true can produce one route; cash ceiling still forces split/rejection.

### 10. Notify both old and new riders on reassignment

Primary files:

- `regional-route-planning.service.ts`
- existing notification/outbox services
- rider clients

Requirements:

- Capture previous rider before mutation.
- On reassignment, send old rider a distinct `ROUTE_REMOVED` notification/event and new rider a `ROUTE_ASSIGNED` notification/event.
- Use the existing durable notification/outbox path, not an untracked best-effort push inside a DB transaction.
- Payload must contain only safe route identifiers and deep-link target.
- Old rider cached UI must remove/disable the run immediately when the event arrives; server authorization remains authoritative.
- No old-rider notification on first assignment or same-rider idempotent retry.

---

## Commit 3 — production trusted-drop, evidence, arrival/completion geofence

Primary files:

- `apps/api-gateway/src/subscriptions/customer-subscription.service.ts`
- `apps/api-gateway/src/subscriptions/delivery-run-operations.service.ts`
- `apps/api-gateway/src/subscriptions/subscriptions.controller.ts`
- `apps/api-gateway/src/subscriptions/subscriptions.dto.ts`
- Prisma schema/migration
- `apps/api-gateway/src/upload/*`
- `apps/mobile-customer` subscription screens
- `apps/mobile-partners/src/screens/rider/RiderRunDetailScreen.tsx`

Requirements:

- Remove customer-supplied trusted-drop token from create flow.
- Generate at least 256 bits of CSPRNG server entropy. Never store plaintext. Store a hash plus encrypted/recoverable material only if repeated display requires it; otherwise issue short-lived signed QR challenges tied to a versioned credential.
- Add customer endpoints/UI to create/display, download/share/print, rotate, and revoke a trusted-drop QR credential. Rotation invalidates previous versions immediately.
- QR payload must be signed, versioned, scoped to the subscription/customer/stop use case, expiry-aware, and replay-protected where appropriate. Do not put customer address/phone in QR plaintext.
- Rider app must use a real native QR scanner. Manual token entry may exist only as an explicitly logged accessibility fallback, not the primary flow.
- Add real native camera capture for proof with permission handling, preview, retake, compression/size limits, upload progress, and retry.
- Reuse `apps/api-gateway/src/upload/*`; validate MIME, magic bytes, size, authorization, and ownership. Return an evidence ID, not an arbitrary URL/reference string.
- Bind uploaded evidence server-side to the exact `deliveryRunStopId`, `deliveryJobId`, rider, capture timestamp, and credential version. Reject cross-stop evidence reuse.
- Require arrival GPS and completion GPS. Compare both to authoritative stop coordinates using configurable geofence radius and maximum acceptable accuracy. Persist coordinates, accuracy, calculated distance, threshold, and decision.
- Trusted-drop completion requires: valid scanned QR, unrevoked credential version, arrival geofence passed, completion geofence passed, and bound photo evidence.
- Keep OTP/security-reception flows working.

Required tests:

- forged/expired/revoked/rotated QR rejected;
- token hash cannot be used as token;
- QR for subscription A cannot complete stop B;
- evidence for stop A cannot bind to stop B;
- arrival and completion outside geofence rejected;
- poor GPS accuracy rejected;
- successful end-to-end trusted drop records immutable linked evidence;
- camera/QR permission denied and retry UX covered.

---

## Commit 4 — durable worker, rider offline queue, admin image uploads

### 8. Multi-instance subscription worker

Primary files:

- `subscription-scheduler.service.ts`
- module/bootstrap/Redis infrastructure
- health/readiness endpoints
- tests and production env docs

Replace process-local `setInterval` as the production execution mechanism.

- Use BullMQ with the existing Redis connection if available. One repeatable scheduler job; horizontally safe workers; deterministic job IDs.
- Configure attempts, exponential backoff, timeout, stalled-job recovery, concurrency, retention, and a dead-letter path.
- Persist/emit `attemptsMade`, `nextRetryAt`, final failure reason, and correlation ID. Add alert escalation on terminal failure using existing alert/notification infrastructure.
- Keep `tick()` callable for admin/manual tests, but production replicas must not each schedule independently.
- Readiness must report queue/Redis health and worker state.
- Generator and planner remain idempotent under duplicate delivery.

Tests: two worker instances process one logical scheduled job; transient failure retries; terminal failure reaches DLQ/alert; restart resumes pending work.

### 9. Android rider offline action queue

Primary app: `apps/mobile-partners`.

- Persist the active run cache, route version, pending actions, local evidence URIs, timestamps, and idempotency keys using the existing secure/Async storage conventions.
- Use NetInfo or the existing connectivity layer.
- Queue arrival, QR/evidence upload dependency, completion, failure, and permitted reorder actions while offline.
- Replay serially on reconnect in dependency order. Upload staged evidence before completion.
- Every mutation must use a stable idempotency key.
- Handle 409/version conflicts with a dedicated sync-conflict screen: show server state, pending local action, safe discard/retry/refresh choices. Never silently overwrite server state.
- Show clear Offline / Pending sync / Synced / Conflict states.
- Do not cache sensitive QR/token plaintext longer than required; wipe it after successful verification.

Tests: app restart preserves queue; reconnect replays once; duplicate replay is idempotent; expired/reassigned route creates conflict and does not deliver; evidence upload resumes.

### 11. Admin subscription plan image upload

Primary files:

- `apps/admin-dashboard/src/app/(admin)/admin/subscriptions/page.tsx`
- subscription form/components
- `apps/api-gateway/src/upload/*`
- subscription DTO/service tests

- Replace URL-only UX with desktop and mobile image file inputs while retaining optional URL paste only if product policy wants it.
- Reuse secure upload API. Show preview, progress, validation, replace/remove, and error toast.
- Validate dimensions/aspect hints, MIME/magic bytes, and size; do not accept executable/SVG content unless sanitized by existing policy.
- Save returned URLs into `imageUrl` and `mobileImageUrl` only after successful upload.
- Editing an existing plan must preserve images unless explicitly replaced/removed.
- Add Playwright coverage for upload preview, create, edit-preserve, replace, invalid file, and API failure toast.

---

## Mandatory validation and proof

Run and report exact commands and exit codes:

```bash
npx prisma format --schema packages/database/prisma/schema.prisma
npx prisma validate --schema packages/database/prisma/schema.prisma
npm run ci:api
npm run build:admin
npm run build --workspace apps/mobile-partners
npm run build --workspace apps/mobile-customer
```

Also run all newly added targeted tests, existing subscription/regional-routing suites, upload tests, notification tests, and Playwright admin subscription tests. Run the repository's Android/native verification workflow or equivalent Gradle assemble/test command used by CI.

Do not claim completion without all of the following committed under `docs/qa/subscription-release-hardening/`:

1. `test-results.md` — commands, exit codes, test counts, failures/retries.
2. `security-isolation.md` — Rider A/Rider B, Store A/Store B, Admin evidence with sanitized IDs.
3. `timezone-serviceability.md` — IST and non-IST examples showing local and UTC values.
4. `atomicity.md` — before/after DB assertions proving failed split/recovery leaves no mutation.
5. `trusted-drop.md` — API test evidence plus Android screenshots for QR scan, camera preview/retake, geofence rejection, successful completion.
6. `offline-sync.md` — airplane-mode/restart/reconnect/conflict proof.
7. `admin-upload.md` — Playwright screenshots/artifacts for plan image upload.
8. `worker.md` — multi-worker single-processing, retry, DLQ, and readiness proof.
9. `migration.md` — migration name, backward compatibility notes, and rollback/forward-fix procedure.

Final response from the CLI agent must include:

- branch and HEAD SHA;
- commit list mapped to the four phases;
- changed-file list;
- migrations added;
- exact test/CI results;
- artifact paths;
- known limitations (zero is acceptable only if true);
- no merge performed.
