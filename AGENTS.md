# Repository notes for agents

## Monorepo layout

TypeScript monorepo (npm workspaces):

- `apps/api-gateway` — NestJS, owns most business logic and tests
- `apps/admin-dashboard` — Next.js
- `apps/mobile-customer`, `apps/mobile-partners` — Expo / React Native
- `packages/database` — Prisma schema and migrations
- `packages/types`, `packages/utils` — shared packages

## Running the api-gateway tests

The suite needs a reachable Postgres. Without `DATABASE_URL` you get ~604
`PrismaClientInitializationError` noise failures that look like real bugs.
Build the workspace packages first, or `@aagam/database` and `@aagam/types`
cannot resolve and `tsc` reports hundreds of unrelated errors.

```bash
npm install

# shared packages must be built before api-gateway will typecheck
npm run build --workspace=packages/types
npm run build --workspace=packages/utils
npm run build --workspace=packages/database   # also runs prisma generate

# Postgres (Docker daemon may need starting first: sudo dockerd &)
sudo docker run -d --name aagam-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=aagam_ci -p 5433:5432 postgres:15-alpine

export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/aagam_ci?schema=public"

# CI applies migrations (not db push) — match it, or you may test against
# a schema that differs from what migrations actually produce
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

npm run test:ci --workspace=apps/api-gateway
```

`npm run test:ci` takes several minutes; run it in the background and poll the
log rather than blocking the terminal.

### Where the specs live

`apps/api-gateway` runs two Jest projects (see `jest.config.js`):

- **unit** — `jest.unit.config.js`, specs colocated under `src/` next to the
  code they exercise. Fast, no database.
- **integration** — `test/jest-e2e.json`, specs under `apps/api-gateway/test/`.
  These are cross-module / contract / DB suites. They share one database, so
  the npm scripts run them with `--runInBand`.

`npm test` and `npm run test:ci` run both projects; use
`npm run test:unit` / `npm run test:integration` to run one. `test:ci` still
ignores `api-smoke.spec.ts`, which needs a live server.

Specs under `test/` reach back into the app with `../src/...` and reach the
repo root with `path.resolve(__dirname, '../../..')`. If you move a spec
between the two projects, those depths change — fix them in the same commit.

The `test:phase6/8/9/10/11/12` scripts and their phase-numbered filenames are
load-bearing: `scripts/predeploy-readiness-audit.js` lists them as required.

## Comparing against a baseline

To prove whether a change caused a failure, compare failing suites with and
without it, since the suite has pre-existing failures:

```bash
git stash push -u -m baseline
npm run test:ci --workspace=apps/api-gateway > /tmp/base.log 2>&1
git stash pop
# then diff the FAIL lines of the two runs
```

## Subscription money is derived, not read raw

A subscription's cash lives in two places that can drift apart: the
`CustomerSubscription.amountCollectedPaise` / `amountDuePaise` ledger, and the
per-delivery `SubscriptionDelivery.cashCollectedPaise` day cells. Absolute
writers (`createManualSubscription`, `renewSubscription`,
`updateManualSubscription`) and partial ledger updates can leave the ledger
short of the cash already recorded on deliveries.

Any reader that shows a "Paid" or "Due" figure must go through
`reconcileSubscriptionBalance` in
`apps/api-gateway/src/subscriptions/subscription-balances.ts`, which treats the
ledger as a floor and absorbs the missing day-cell cash. Reading the raw columns
renders a Paid figure that disagrees with the day cells in the same row. This is
exactly what produced the 31-Day Matrix showing Paid Rs 50 next to a Rs 130 cell
for Nookalamma.

When adding a new money column, use the helper rather than the raw column, and
keep values scoped the way the row is scoped: the Subscribers tab lists one
subscription per row, while the grid merges a customer's active and previous
subscriptions into a single row and must reconcile across all of them.

## Migrations

New migrations in this repo are written idempotently
(`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and
`DO $$ ... EXCEPTION WHEN duplicate_object` around foreign keys) so that
`migrate deploy` still succeeds if the DDL was already applied manually.

## Automations

`automations/*.json` records the payloads deployed to the OpenHands automation
API. They are created through the preset endpoints (not the bare
`/api/automation/v1` collection, which expects a pre-built tarball):

- `POST /api/automation/v1/preset/prompt` — natural-language prompt
- `POST /api/automation/v1/preset/plugin` — prompt plus plugins/skills

`timeout` is capped at 1800 seconds. `repos` entries use
`{"url": "...", "ref": "..."}`. To re-deploy after editing, POST the file to
the matching preset endpoint; the automation list only reflects what was
actually deployed.

### Event filter gotcha

The `filter` field is JMESPath. A bare `!pull_request.draft` evaluates to
`null`, which never matches, so the automation silently never fires. Compare
explicitly instead:

```
repository.full_name == 'owner/repo' && pull_request.draft == `false`
```

`on` accepts dotted event types such as `pull_request.opened`. The available
types for a source are listed by
`GET /api/automation/v1/events/{source}/requested-types`.

### Only one automation path

There is intentionally no GitHub Actions workflow driving OpenHands. The
automations above are the single path, because a second one duplicated the
work and failed in ways that reported success:

- its `LLM_MODEL` was `openhands/deepseek-v4.1-flash` / `openrouter/anthropic/claude-3.5-sonnet`,
  both of which return `401` from `llm-proxy.all-hands.dev`
- it called `openhands --headless` without `--always-approve`, so tools that
  need confirmation never ran
- when the agent died early it still posted "did not find any valid actionable
  code changes", which reads as "the PR is clean" and hid the failure

The `openhands-fix.yml` workflow was removed for these reasons. Note that the
OpenHands CLI can still exit `0` without doing anything when observability is
enabled, because the installed `lmnr` does not accept the `rollout_entrypoint`
kwarg that the SDK passes; a run with a `TypeError: observe() got an unexpected
keyword argument` and no actions is that bug, not a model problem.

## Delivery operations are a facade over per-use-case services

`orders/delivery-operations.service.ts` used to be a 2,762-line god service. It
is now a thin facade: `DeliveryOperationsService` keeps the public method
surface (controllers and the subscription run services depend on it) and
delegates each call to a focused service in the same directory.

- `delivery-operations.base.ts` — `DeliveryOperationsBase`, the abstract class
  holding what every use case needs: the advisory `lock`, the `DeliveryOperation`
  ledger helpers, proof/OTP hashing, the `assert*OrAdmin` authz checks, and
  `ensureCodLedger`. Helpers are `protected`, not `private`, so subclasses can
  use them.
- `delivery-operations.types.ts` — shared types and constants.
- `delivery-operations.{query,pickup,otp,delivery,cod,failure,return}.service.ts`
  — one cohesive use case each, all extending the base.

Add a new use case as a new service, not by growing the facade. The per-use-case
services are independent; the only cross-flow call is `recordPickupProof`, which
stays inside the pickup service. Do not re-merge these files.

Four contract specs (`order-delivery-mobile-ui`, `phase5-delivery-proof-cod-failures`,
`subscription-delivery-runs`, `subscription-production-completion`) assert on the
**source text** of these files via `read(...)`. If you move a method between the
services, update the path those specs read in the same commit — they fail with a
path-shaped assertion, not a behavioural one.

## The store milk grid follows the same facade pattern

`subscriptions/store-milk-grid.service.ts` (1,592 lines) was split the same way
and is now a thin facade:

- `store-milk-grid.types.ts` — `GridCell`, `PlanInfo`, `GridRow` (re-exported
  from the facade so existing importers keep working).
- `store-milk-grid.base.ts` — `StoreMilkGridBase`, holding `resolveBaseLiters`
  and `extractWeightGramsFromName`, the two helpers the grid and the dispatch
  summary both need. They are `protected`; the static helper is called as
  `StoreMilkGridBase.extractWeightGramsFromName`.
- `store-milk-grid.{grid,quick-action,dispatch,statement}.service.ts` — the four
  use cases (`exportCsv` calls `getGrid`, and `autoDispatchDefaultRiders` calls
  `dispatchToRider`, so each pair lives together).
- `subscriptions.controller.ts` is untouched — it still injects the facade.

`store-offline-customer-lifecycle.contract.spec.ts` reads this service's source
text: it asserts `customer: { isActive: true }` against the grid service and
`subscription: { ...storeFilter, customer: { isActive: true }` against the
dispatch service, so a split must keep those literals in the file the spec
reads.

## subscription-admin-reporting is also a facade now

`subscriptions/subscription-admin-reporting.service.ts` (1,514 lines) had no
cross-method calls and one injected dependency, so it split into seven
use-case services plus the facade:

- `.payments.service.ts` — `reconcileDeliveredDelivery` (the only `this.funding`
  user, so it carries the `SubscriptionCashFundingService` injection) and
  `recordCustomerPayment`
- `.read.service.ts` — the ten admin/store reporting reads, and the file-scope
  `deliveryContact` helper they share
- `.correction.service.ts`, `.issue.service.ts`,
  `.offline-customer.service.ts`, `.manual-subscription.service.ts`,
  `.renewal.service.ts`

`createManualSubscription` constructs its own `SubscriptionPlanService`, so the
manual-subscription service does too. The four specs below read this service's
source text and now read the file that owns each asserted literal:
`manual-subscription.contract.spec.ts` (offline-customer service for `offline.`
/ `@aagaam.local`), `store-offline-customer-lifecycle.contract.spec.ts`
(offline-customer service for `offlineStoreId`, read service for `isActive`),
`subscription-d1-operations.contract.spec.ts` and
`subscription-delivery-runs.contract.spec.ts` (read service).

## order.service.ts is a facade over a shared base

`orders/order.service.ts` (1,118 lines) was the order god-service. Unlike the
subscriptions services it has real cross-method calls, so the split keeps a
shared base:

- `order.service.base.ts` — `recordStatusHistory`, `getTracking`,
  `emitTrackingUpdate` and the cross-cutting internals (`statusNote`,
  `timestampFieldForStatus`, `computeEta`, `computeTripSummary`,
  `computeTrackingState`, `haversineKm`, `cancelAssociatedDeliveryJob`,
  `releaseCouponRedemption`, `completeAssociatedDeliveryJob`). The moved
  private helpers become `protected`; `updateStatus` calls
  `emitTrackingUpdate`, so tracking stays on the base rather than in a service.
- `order.status.service.ts` — `updateStatus` plus the four transition tables.
- `order.cancellation.service.ts` / `order.rider.service.ts` /
  `order.query.service.ts` — the remaining use cases.

The facade keeps the exact two-argument constructor
`(TrackingGateway, RefundsService)`. Roughly 100 test sites call
`new OrderService(gateway, refunds)`, so it constructs the sub-services itself
and hands them the gateway/refunds through `useDeps()`; the base exposes them
as `protected get trackingGateway()` / `protected get refundsService()`. Do not
change that constructor or move a sub-service call onto another sub-service —
that would create a cross-service edge the base is designed to avoid.

Two specs read this file's source text: `admin-cancellation-terminal.contract.spec.ts`
now reads `order.service.base.ts` (the delivery-job cancellation literals) and
`phase5-delivery-proof-cod-failures.spec.ts` reads `order.query.service.ts`
(the `findOne` `deliveryJob` select).

## promotions.service.ts is a facade over a shared base too

`promotions/promotions.service.ts` (1,063 lines) had no constructor and no
injected dependency — it reaches the DB through the module-level `prisma`
singleton — so its facade also builds its sub-services itself:

- `promotions.shared.ts` — `DbClient`, `PricingLine`, `couponInclude`,
  `campaignInclude`
- `promotions.service.base.ts` — the cross-cutting helpers (`requireText`,
  `date`, `validateSchedule`, `validateInternalPath`, `effectiveStatus`,
  `campaignTargetUrl`) plus `adminCoupons`
- `promotions.campaign.service.ts` — the campaign authoring/listing/feed group
- `promotions.coupon.service.ts` — the coupon authoring group
- `promotions.pricing.service.ts` — `evaluateCoupon`, `calculateDiscount`,
  `publicCoupons`

`deals` is the one method that spans two groups (`activeCampaigns` +
`publicCoupons`), so it stays on the facade and calls `this.campaign` /
`this.pricing`. Keep the zero-argument constructor: one test does
`new PromotionsService()`. `publicCoupons` is public because the facade's
`deals` calls it; the private validators are `protected` on their services and
are never delegated.

## rider-portal.service.ts and its two pre-existing partial services

`riders/rider-portal.service.ts` (1,003 lines after removing dead code) had no
constructor and no injected dependency. It also had a partial, older split:
`rider-portal-read.service.ts` (625 lines) and
`rider-portal-secure.service.ts` (377 lines) are already injected separately by
`rider-portal.controller.ts` and are used for `history`/`profile`/`offerDetail`
and friends. Two methods on the old service — `history` and `profile` — were
superseded by those services and were referenced nowhere, so they (and their
now-unused `TERMINAL_STATUSES` const) were deleted rather than relocated. Do
not re-add them.

The rest split into a facade over a shared base:

- `rider-portal.service.base.ts` — `rider`, `range`, `activeJob`, `activeJobs`,
  `safeProfile`, `encryptSensitive` + `ACTIVE_STATUSES`, `jobInclude`
- `rider-portal-orders.service.ts` — offers, live deliveries, pickup tasks
- `rider-portal-activity.service.ts` — earnings, COD, performance,
  availability/breaks, profile, support
- `rider-portal-admin.service.ts` — the admin operations

`home` is the only public method left on the facade: it needs the inherited
helpers and nothing else, so it is not a "god" method and delegating it would
add a pointless file. The facade keeps its no-argument constructor because
`EligibleRiderPortalService` extends `RiderPortalService` and overrides
`setStatus`/`endBreak` with a working `super` chain (wired as the provider
alias in `rider.module.ts`) — keep those two methods overridable.

Four specs read this service's source text and now read the file that owns each
literal: `admin-cancellation-terminal` and `order-delivery-mobile-ui` read
`rider-portal-orders.service.ts`, `phase5-delivery-proof-cod-failures` reads
`rider-portal-orders.service.ts` (the OTP SQL fragment), and
`phase4-rider-portal` reads `rider-portal-activity.service.ts` for the earnings
literal and `rider-portal.service.base.ts` + `rider-portal-activity.service.ts`
for the bank/crypto literals.

## regional-route-operations.service.ts

`subscriptions/regional-route-operations.service.ts` (1,039 lines) took one
injected dependency (`RegionalRoutePlanningService`) and split into a facade
over a shared base:

- `regional-route-operations.service.base.ts` — `run`, `assertVersion`,
  `assertEditable`, `constraints`, `assertCapacity`,
  `resetPendingJobOwnership`, `recalculate`, `audit` + every module-level
  const/type/function and the planner-independent helpers
- `regional-route-operations.mutation.service.ts` — `previewSplit`, `split`,
  `merge`, `moveStop`, `reassign`, `reorder`, `cancel`, `interruptAndRecover`
  (plus `splitCandidates` and `resequence`)
- `regional-route-operations.query.service.ts` — `dashboard`, `events`

The facade is not a pure delegator: it keeps the original one-argument
constructor `(RegionalRoutePlanningService)`, wires the planner into the
mutation service, and itself delegates only the 10 public methods.

Two specs read this service's source text with a `slice` between the literals
`async split(` and `async merge(`, so those two methods (and the shared tokens
they need) must stay textually adjacent in one file — they live together in the
mutation service. Both specs now read
`regional-route-operations.service.base.ts` + `...mutation.service.ts`
concatenated, not the facade.

## delivery-run-operations.service.ts

`subscriptions/delivery-run-operations.service.ts` (931 lines) held the rider's
whole run lifecycle and split into a facade over a shared base:

- `delivery-run-operations.service.base.ts` — `rider`, `ownedRun` + `Actor`
- `delivery-run-read.service.ts` — `today`, `details` (no deps)
- `delivery-run-pickup.service.ts` — `confirmPickupReceipt`, `start`
- `delivery-run-stop.service.ts` — `arrive`, `issueOtp`, `complete`, `fail`,
  `reorder`, `finalizeDeliveredStopWithinTransaction`
- `delivery-run-close.service.ts` — `finish`, `cashAccountability` (no deps)
- `delivery-run-field.service.ts` — `extraMilk`, `toggleSlot`, `recordPayment`,
  `skipStop` (no deps)

The facade keeps the original four-argument constructor
(`workflow, deliveryOperations, funding, trustedDrop`) so the module wiring is
unchanged, and constructs each child with only the dependencies it needs. Two
specs read this source: `subscription-delivery-runs` reads the pickup + stop +
close files, `subscription-production-completion` reads the stop file for its
`GeofencePhase` literals.

## offline-customer.service.ts

`subscriptions/offline-customer.service.ts` (960 lines, no constructor) split
into a facade over a shared base:

- `offline-customer.service.base.ts` — `offlineIdentity`, `recycleBinState`,
  `activeState`, `ownershipFilter`, `mutationOwnershipFilter`,
  `loadOfflineCustomer` + `OfflineCustomerActor`
- `offline-customer-directory.service.ts` — `listCustomers`,
  `getCustomerDetail`, `getDeliveryTracker`, `reactivateCustomer`
- `offline-customer-lifecycle.service.ts` — `moveToRecycleBin`,
  `restoreFromRecycleBin`
- `offline-customer-purge.service.ts` — `permanentDeleteCustomer`,
  `redactSnapshot`

The `RECYCLE_BIN_PAUSE_PREFIX` / `RECYCLE_BIN_PAUSE_REASON` / `PURGED_EMAIL`
statics stay on the facade (made public) because
`store-offline-customer-lifecycle.contract.spec.ts` asserts the literal
`pauseReason: OfflineCustomerService.RECYCLE_BIN_PAUSE_REASON` in
`offline-customer.service.ts`. The ownership-predicate unit spec instantiates
`OfflineCustomerServiceBase` directly — the predicates moved there, and the
facade no longer carries them. The lifecycle source-text spec reads facade +
base + directory + lifecycle + purge concatenated.

### Checking a run

`GET /api/automation/v1/{automation_id}/runs?limit=5` gives `status` and
`current_phase`. `Timed out: command timed out or was killed` means the run hit
the 1800s cap. The prompts therefore push their fixes before reporting, so work
survives a timeout, and treat 20 minutes as their own deadline.