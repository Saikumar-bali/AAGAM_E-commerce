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

After `npm ci` (which CI runs, and which wipes generated output), regenerate the
Prisma client or ~59 suites fail to run with `PrismaClientInitializationError`:

```bash
npx prisma generate --schema packages/database/prisma/schema.prisma
```

## Linting

A single root `.eslintrc.js` lints every workspace; there is no per-app ESLint
config. Run it from the repo root:

```bash
npm run lint        # 0 errors expected; warnings are tracked debt
npm run lint:fix
```

It is syntactic only (no type-aware `project` parsing) so it works without
building the workspace packages first. CI runs `npm run lint` right after
`npm install`, before any build. The config deliberately does not extend
`next/core-web-vitals`: that config bundles its own `eslint-plugin-react-hooks`
5.x, and ESLint 8 refuses two copies of one plugin name, so the Next rules are
enabled directly through `@next/eslint-plugin-next` and React comes from the
single 7.x copy at the repo root. Keep it that way when adding rules.

`apps/admin-dashboard` previously used `next lint`, which prompts interactively
and hangs in CI; it now uses `eslint` like everything else.

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

## Dependency security

`npm audit` must be clean. `.github/workflows/dependency-security-audit.yml`
runs `scripts/verify-dependency-security.js` on every PR, and
`scripts/verify-dependency-security.js` fails the build if any advisory URL is
not on its reviewed allow-list. The allow-list only contains transitive
advisories that have no in-range fix; each entry carries a comment naming the
chain and the patched version.

Root `overrides` in `package.json` pin the fixes, scoped to the parent package
where a global pin would break the tree:

- `ajv` -> `fast-uri 3.1.8` (via `@nestjs/cli`)
- `@istanbuljs/load-nyc-config` -> `js-yaml 3.15.2`
- `@react-native-community/cli-config` -> `joi 17.13.8`
- `@react-native-community/cli-server-api` -> `body-parser 1.20.8`
- `@react-navigation/native` -> `@react-navigation/core 7.23.0` (drops the
  `query-string`/`decode-uri-component` chain)
- `express` -> `qs 6.16.0`
- `exceljs` -> `uuid 11.1.1`
- `@firebase/firestore` -> `@grpc/grpc-js 1.14.5` (the `firebase` 12 /
  `@firebase/firestore` 4.x line still pins `~1.9.0`, which is inside the
  affected range; the mobile SDK is exercised only by the customer/partner apps,
  which do not test through the jest suite)

Overrides are only applied by a fresh resolve: after editing them, delete
`node_modules` and `package-lock.json` and reinstall. An incremental
`npm install` leaves the old version in the lockfile (it shows up as
`invalid: "x" from node_modules/y` in `npm ls`) and the advisory persists.

`image-size` is no longer in the tree (metro 0.84.6 dropped it), so
`patch-image-size-cves.js` and `test-image-size-cve-patch.js` now no-op when it
is absent instead of failing the install. If it returns unpatched, `npm audit`
flags it again and the gate fails.

The full `test:ci` suite needs more than Node's default heap after the Sentry
11 / googleapis 182 upgrade, so `test` and `test:ci` run jest through
`node --max-old-space-size=6144`. Without it the run dies with
`Ineffective mark-compacts near heap limit` partway through. Integration specs
share one database: never run the suite twice without `prisma migrate reset` in
between, or `phase6b-promotions-coupons` fails on leftover coupon usage.

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

### Checking a run

`GET /api/automation/v1/{automation_id}/runs?limit=5` gives `status` and
`current_phase`. `Timed out: command timed out or was killed` means the run hit
the 1800s cap. The prompts therefore push their fixes before reporting, so work
survives a timeout, and treat 20 minutes as their own deadline.

## Subscription lifecycle is delivery-first

- `SubscriptionCashFundingService.consumeDeliveredWithinTransaction` is the
  single entitlement helper for every completion path (store self-delivery
  `verifyAndCompleteDelivery`/`updateDelivery`, milk-grid `TOGGLE_DELIVERED`,
  admin `reconcileDeliveredWithinTransaction`, order-flow reconciliation).
  Completion — not cash collection — advances the plan: a delivery that
  physically happened activates a `PENDING_CASH_COLLECTION`/`PAYMENT_DUE`
  contract to `ACTIVE` and, on the final delivery, `COMPLETED`.
- The outstanding `amountDuePaise` is preserved across completion so the
  customer keeps seeing the pending balance while the plan runs. Callers that
  just recorded cash pass `amountDueOverridePaise` (post-cash balance);
  callers that flip the delivery to `DELIVERED` before calling pass
  `deliveryAlreadyCompleted: true` and own idempotency via a stable audit key.
- Do not re-add the old "no funded entitlement" conflict or gate activation on
  cash: the cash ledger (`amountCollectedPaise`/`amountDuePaise`) and the
  lifecycle status are independent concerns.
- Customer-visible copy: use "Pending <amount>" for the subscription-level
  balance and "All dues cleared" when zero, in both
  `apps/mobile-customer/.../SubscriptionDetailScreen.tsx` and
  `apps/admin-dashboard/src/app/(shop)/shop/subscriptions/[id]/page.tsx`. The
  cross-app contract spec `subscription-delivery-runs.contract.spec.ts`
  asserts these strings.

## Rider assignment visibility (store)

- `GET /store/subscriptions/rider-assignments?date=YYYY-MM-DD` (StoreSubscriptionsController)
  returns `{ date, slots, totals, riders[], unassigned[] }` grouping assigned stops
  per rider-owned run. A delivery counts as "assigned" only when it has a
  `DeliveryRunStop` whose `deliveryRun.rider` is set — the milk grid matrix and
  the orders board read different fields, so keep `order.riderId` and the run
  stop in sync.
- `dispatchToRider` (store-milk-grid.service.ts) must always create or move a
  `DeliveryRunStop` onto the rider's run and set `order.riderId` +
  `riderAssignedAt`; otherwise a dispatch shows as done but the grid/runs/orders
  show "unassigned".
- Store subscriptions UI: `RiderAssignmentsDialog` is opened from the header
  button and the "Rider Assignments" tab; the old "Tomorrow Prep" is now the
  "Prep list" tab.
- Test DB is unavailable in the sandbox: jest suites that hit `prisma` fail with
  `Environment variable not found: DATABASE_URL`. Run the full suite from
  `apps/api-gateway` (`npx jest --runInBand`) and treat those as pre-existing.

## Deploys and verifying against aagaam.in

- `.github/workflows/deploy.yml` only runs on `main` (or a manual
  `workflow_dispatch` with a `ref`). Pushing a feature branch such as `bugs` does
  **not** deploy, so `https://aagaam.in` keeps serving whatever `main` last
  built. A fix can be correct in the branch and still absent from the live site —
  check `git log origin/main..origin/bugs` before trusting a live repro.
- To reproduce a store-owner issue against the live API without the browser:
  `POST /api/auth/login` with `{email,password}` returns an HttpOnly
  `access_token` cookie; save it with `curl -c` and reuse with `curl -b` against
  `/api/store/subscriptions/*`. This is far more reliable than driving the
  heavily-polling grid page in the browser (element indices shift every refresh).
- Subscriber-count bug (fixed on `bugs`): the live `GET /store/subscriptions/subscribers`
  returned a raw array of every non-terminal contract, so 16 `CANCELLED` rows
  plus duplicate/superseded live contracts inflated the tab to 58 while the grid
  showed 36 customers. The fix returns `{subscribers, counts:{total,active,paused,cancelled}}`,
  dedupes live contracts to one row per customer, and excludes cancelled rows
  from the live list (queryable via `?status=cancelled`).

## Rider returns and freeing BUSY riders

- Failed-delivery return: the parcel is physically with the rider, so the rider
  must always have a way to hand it back. `POST /orders/delivery-operations/jobs/:id/return/start`
  now passes `riderInitiated` when the caller is a `RIDER`; `startReturn` then
  supersedes the policy default (retry/escalate) with an auditable
  `RETURN_TO_STORE` override decision instead of refusing. Admin calls keep the
  strict policy check.
- `GET /riders` (ADMIN) now returns each rider with `workload`
  `{activeDeliveries, activeRuns, canBeFreed}`. The admin riders page shows this
  next to the Busy badge and offers **Make available** (Busy → Online) / **Set
  online** (Offline → Online). `PATCH /riders/:id/status` allows an admin to
  release a BUSY rider to ONLINE without a fake GPS ping, but still refuses when
  the rider holds active deliveries/runs and returns a message explaining why.

## Rider-assignment visibility (mobile)

- Live `aagaam.in` (revision `6caa4b6`) has **no** rider-assignment surfaces,
  so the dispatch result cannot be read from the live API yet:
  `GET /store/subscriptions/rider-assignments` → 404, `.../available-riders` → 404.
  The inclusion/exclusion of the rider dispatch board is itself a candidate
  deploy/branch issue.
- Fallback that works live: `GET /store/subscription-operations/runs?serviceDate=YYYY-MM-DD`
  returns runs with `riderId`, `rider`, and `stops[]`; a stop with
  `deliveryJobId` (especially a non-`PLANNED` status) is a rider-assigned
  delivery. `runs` for a store scope already returns all stores the owner can see.
- Count re-verified live on 2026-10-02 against `aagaam.in` (revision still
  `6caa4b6` on `main`; `bugs` is not deployed): **0 customers are assigned via
  the board** for `2026-10-03`. `GET /store/subscriptions/rider-assignments`
  is still `404` (and `.../available-riders` is now `200`), so the board cannot
  be read live. Fallback `runs` shows the single early-dispatched AM run
  `RUN-AAGA-AM-2026-10-03-f2ce` (`riderId ff7e0aba...`, rider `saikumarbali`,
  status `IN_PROGRESS`) with **0 stops** (`totalStopCount: 0`), so it assigns
  no customer. Every `RUN-ANAKAPAL-...` run on `2026-10-03` has `riderId: null`
  even though its stops carry a `deliveryJobId` - that linkage is created at
  order generation, not by a rider dispatch, so it must not be read as
  "assigned". The only true dispatch signal is a `DeliveryRunStop` on a run
  whose `riderId` is set; the delivery `dispatch-summary` for the day reports
  `ASSIGNED: 1` (delivery `cmuqgalkr2x9vvo0d47f60wcq`, stop 3), but its run
  stop lives on the riderless `RUN-ANAKAPAL-20261003-01-D8A121`, i.e. the
  order's `riderId` and its run stop are out of sync. Net board count: 0.
- Mobile entry point: the old floating **"Tomorrow"** prep FAB is replaced by
  `StoreOperationsDock` (Rider Assignments primary, Preparation secondary).
  Rider Assignments calls `GET/POST /store/subscriptions/*`, so the screen is
  inert until that controller is deployed to the environment being tested.

## Mobile partner offer alerts

- `apps/mobile-partners/src/domain/partnerAlertPolicy.ts` makes offer alerts
  once-only and accept-gated. The persistent alerted set lives in AsyncStorage
  (`aagam:partner:alerted:<session>`), the first inbox load is a reconciliation
  pass (`alertKeysForInboxBootstrap`), and inbox polling (30s) only backstops
  missed FCM pushes. Never reintroduce the old `unseen.slice(-3)` re-alert burst.
- The live `SUPABASE_DB_URL` in this sandbox points at an unrelated project
  (trading/`public.instruments` schema), not the AAGAM database. Read live store
  data through the API with a store-owner login cookie instead.

## Subscription skip / pause lifecycle (fixed on `bugs`)

- Root cause of the grid-vs-rider split: skip and pause only flipped
  `SubscriptionDelivery.status`. The skip cutoff (12h) is later than order
  generation (18-24h), so the skipped/paused day usually already owned an
  `Order`, a `DeliveryJob` and a `DeliveryRunStop`. The grid showed NOT TAKEN
  while the rider board still had a live stop.
- `SubscriptionLifecycleService` is now the single teardown used by every path
  (customer skip, customer pause, store SKIP quick action). It cancels the run
  stop + delivery job + order, recomputes the run's stop counters, marks
  pause-window occurrences `SKIPPED` with `skipReason = 'PAUSED_WINDOW'`
  (keeping their order), restores them on resume (`ORDER_GENERATED` if the row
  already had an order, else `SCHEDULED`), and shifts every non-terminal
  delivery + its order on resume (previously only `SCHEDULED` rows moved, so a
  generated paused day stayed due on the old date).
- Customer `skip()` now accepts `SCHEDULED` **or** `ORDER_GENERATED` within the
  cutoff, and its extension row carries the skipped row's `deliverySlot`,
  `storeId` and `deliveryZoneId` (it used to default to AM with no zone).
- `dispatchToRider` excludes `SKIPPED`/`CANCELLED` deliveries, and
  `getDispatchSummary` no longer counts skipped/cancelled rows as milk to prep.
- Store grid rows now expose `status` / `pauseEffectiveFrom`, and
  `MilkDeliveryGrid` renders a **PAUSED** badge so the store sees a paused
  customer. Paused customers stay in the grid (filter includes `PAUSED`) so the
  store can still see and bill them.
- Handover proof: `SubscriptionDeliveryMethod` (PERSONAL_HANDOVER /
  TRUSTED_DROP / SECURITY_RECEPTION) is a rider-delivery concept. It is
  genuinely enforced for rider runs, but silently discarded for store delivery
  (`dispatchToRider` overwrites `proofMode`; store self-delivery verifies by
  name/phone). Do not remove the three options globally; gate the customer
  picker on store-delivery/pickup so a discarded choice is not asked.

