# Repository notes for agents

## Monorepo layout

TypeScript monorepo (npm workspaces):

- `apps/api-gateway` — NestJS, owns most business logic and tests
- `apps/admin-dashboard` — Next.js
- `apps/mobile-customer`, `apps/mobile-partners` — Expo / React Native
- `packages/database` — Prisma schema and migrations
- `packages/types`, `packages/utils` — shared packages

## Agent skills

The repo carries its own self-updating agent skills under `skills/<name>/`
(a tracked, top-level directory — deliberately not a tool-local dot-directory,
so any model that clones the repo finds them without configuration). Load one
when the task matches its description; every file is plain Markdown and is
readable without loading anything.

- **`aagam-testing`** — end-to-end testing of the four role surfaces
  (customer shop, store portal, rider portal, admin dashboard): subscription
  request → store assigns rider → rider pickup checklist → store handoff →
  OTP/COD delivery, plus the store milk grid's packed/sold/left litres.
  Holds `references/flows.md` (per-role UI flows),
  `references/api.md` (env-var credentials, cookie login, endpoint map),
  `references/store-grid.md` (litre math + assertions G1–G9),
  `references/bug-register.md` (the living defect register),
  `references/CHANGELOG.md` (append-only skill history) and
  `scripts/live-revision.ps1` (what `aagaam.in` is serving vs `origin/main`).

Two rules that go with it:

1. **No credentials in the repo.** The skill reads role logins from
   `AAGAM_CUSTOMER_*` / `AAGAM_STORE_*` / `AAGAM_RIDER_*` / `AAGAM_ADMIN_*`
   environment variables at runtime and asks the user when they are unset.
   Never write a password, cookie, token or phone number into a skill file, a
   spec, a commit or a screenshot.
2. **Findings must be written back.** After a testing session, record new
   defects in `references/bug-register.md`, correct any flow the skill got
   wrong, then bump `metadata.version` / `metadata.last-verified` in the
   skill's `SKILL.md` and append one line to `references/CHANGELOG.md`.
   Anyone — human or another model — may update the skill the same way; that
   is the point of it.

### Required stack skills

Tasks in this repository must use the stack skills below. Load the matching
skill **before** starting work in that area and follow it over ad-hoc habits.
If a skill is not installed in the current environment, install it with the
command shown (or ask the user) — do not skip it silently.

| Area / folder | Skill to load | Install |
| --- | --- | --- |
| Turborepo, `turbo.json`, task caching | `turborepo` | `npx skills add vercel/turborepo@turborepo -g -y` |
| `apps/api-gateway` — NestJS modules, DI, controllers, guards | `nestjs-best-practices` | `npx skills add kadajett/agent-nestjs-skills@nestjs-best-practices -g -y` |
| `packages/database` — Prisma schema, client, migrations | `prisma-client-api`, `prisma-database-setup` | `npx skills add prisma/skills@prisma-client-api -g -y` |
| Postgres SQL, indexes, migrations (any host) | `supabase-postgres-best-practices` | `npx skills add supabase/agent-skills@supabase-postgres-best-practices -g -y` |
| `apps/admin-dashboard` — React 19 / Next.js pages and data flow | `vercel-react-best-practices` | `npx skills add vercel-labs/agent-skills@vercel-react-best-practices -g -y` |
| Next.js App Router structure, server/client boundaries | `nextjs-app-router-patterns` | `npx skills add wshobson/agents@nextjs-app-router-patterns -g -y` |
| Tailwind UI and the `@aagam/ui` design system | `tailwind-design-system` | `npx skills add wshobson/agents@tailwind-design-system -g -y` |
| `apps/mobile-customer`, `apps/mobile-partners` — React Native | `react-native-best-practices`, `vercel-react-native-skills` | `npx skills add callstackincubator/agent-skills@react-native-best-practices -g -y` |
| Playwright end-to-end specs | `playwright-best-practices` | `npx skills add currents-dev/playwright-best-practices-skill@playwright-best-practices -g -y` |
| `.github/workflows` — CI/CD changes | `github-actions` | `npx skills add callstackincubator/agent-skills@github-actions -g -y` |
| Complex TypeScript types and generics | `typescript-advanced-types` | `npx skills add wshobson/agents@typescript-advanced-types -g -y` |
| Implementing a feature / reviewing / debugging | `tdd`, then `code-review`, then `diagnosing-bugs` | `npx skills add mattpocock/skills@tdd -g -y` |

Rules for these skills:

1. The in-repo `aagam-testing` skill stays the mandatory skill for end-to-end
   testing of the four role surfaces; the table above adds stack-specific
   skills on top of it.
2. A task that spans several areas loads every matching skill, not just the
   first one.
3. Never rename an installed skill to collide with a built-in skill; skills
   are enabled and disabled by name, and a collision disables both.

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

Any path that *records* cash must guard the collection, not just the read:
reject when the subscription's `amountDuePaise` is already zero, and reject when
the amount exceeds the outstanding due. Otherwise the day cell is incremented
unconditionally while the ledger's due is clamped, and reconciliation then
surfaces the phantom cell cash as a "Paid" figure the ledger never agreed with.
Both the rider COD path (`delivery-run-operations.service.ts` `recordPayment`)
and the store milk-grid path (`store-milk-grid.service.ts` `RECORD_PAYMENT`
quick action) enforce this. The grid deliberately does *not* cap a payment at a
single day cell's outstanding, because its payment tab collects against the
whole subscription (the "Full Due" preset), so a lump sum on one cell is valid.

## Subscription cancel lifecycle (fixed on `bugs`)

- Cancelling a subscription must tear down the rider artifacts of its
  non-terminal deliveries, not only flip the delivery rows.
  `SubscriptionLifecycleService.cancelSubscriptionArtifactsWithinTransaction`
  is the shared helper: it cancels each non-terminal occurrence's
  `DeliveryRunStop`, `DeliveryJob` and `Order`. Both cancel writers call it —
  customer `cancel()` (`customer-subscription.service.ts`) and store/admin
  `cancelSubscription` (`subscription-admin-reporting.service.ts`).
- The helper must run **before** the delivery rows are flipped to `CANCELLED`:
  it only touches non-terminal rows, so a flip first leaves a live run stop
  behind. This was the same grid-vs-rider split the skip/pause paths already
  guard against: the grid dropped the row while the rider board and run prep
  kept the stop.
- `customer-cancel-teardown.e2e.spec.ts` covers both the customer and
  store-owner cancel paths against a dispatched delivery.

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
- A delivery run with no stops (`totalStopCount = 0` and no `DeliveryRunStop`
  rows) must never pin a rider BUSY. `RiderService` excludes such runs from the
  admin workload payload, cancels them while releasing a rider,
  `reconcileRiderOperationalStatus` (the notification/order reconcile sweep)
  applies the same `isEmptyDeliveryRun` rule, and
  `POST /admin/subscriptions/regional-routing/runs/:runId/force-cancel` clears a
  started-but-empty run that the normal `cancel`/`interrupt` paths reject.
- Test DB is unavailable in the sandbox: jest suites that hit `prisma` fail with
  `Environment variable not found: DATABASE_URL`. Run the full suite from
  `apps/api-gateway` (`npx jest --runInBand`) and treat those as pre-existing.

## Deploys and verifying against aagaam.in

- `.github/workflows/deploy.yml` only runs on `main` (or a manual
  `workflow_dispatch` with a `ref`). Pushing a feature branch such as `bugs` does
  **not** deploy, so `https://aagaam.in` keeps serving whatever `main` last
  built. A fix can be correct in the branch and still absent from the live site —
  check `git log origin/main..origin/bugs` before trusting a live repro.
- The release is compiled on the GitHub runner and shipped to the VPS as
  `aagam-build-artifacts-<sha>.tgz`; `deploy.sh` never builds on the host. The
  VPS is a 2 vCPU / ~1.9 GB instance, and an on-host `nest build` for
  `@aagam/api-gateway` took 33–43 minutes of swap-throttled tsc (turbo cache
  `duration` values: 2,000,281 ms on run #380, 2,578,653 ms on run #381), which
  pushed the remote step into the job's 45-minute timeout and produced the
  "cancelled" deploy run #381. Keep the build on the runner. The deploy
  workflow restores the CI-saved `.turbo` cache for the same SHA so
  api-gateway/worker/package builds replay from cache; only admin-dashboard
  rebuilds (its production `NEXT_PUBLIC_*` values are declared in
  `apps/admin-dashboard/turbo.json`, which changes its Turbo hash). `deploy.sh`
  skips `npm ci` when `package-lock.json` is unchanged (stamp at
  `node_modules/.aagam-package-lock.sha256`); when it runs, it is scoped to the
  three deployed workspaces with `--omit=dev` (~1.3 GB, mobile workspaces
  excluded) under a temporary swap file that is released immediately. The VPS
  artifact is staged on `/var/tmp` — `/tmp` is a RAM-backed tmpfs. Deploys end
  with best-effort `apt-get clean` / `git gc --auto` and print disk usage.
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
- Customer app: `SubscriptionDetailScreen` now hides the handover picker and
  shows "Collected at store" for `storeDelivery` subscriptions, and
  `updatePreferences` skips the handover-policy assertion for store delivery.
  `SubscriptionReviewScreen` is unchanged: the customer plan catalog
  (`SubscriptionPlan`) has no `storeDelivery`, so a customer-created
  subscription is always rider-delivered and the picker there is genuine.
- Store-delivery gating must cover every customer surface, not just the mobile
  app. The web shop subscription detail (`(shop)/shop/subscriptions/[id]`) was
  still printing the raw `deliveryMethod` for store-delivered subscriptions
  after the mobile fix; it now shows "Collected at store" when
  `storeDelivery` is true, and the mobile `TRUSTED_DROP` QR action + sheet are
  also suppressed for store delivery. Audit new customer views for the same
  pattern instead of assuming the mobile detail screen is the only surface.
- Subscription start dates may be today. `validateStartDate` rejects only a
  start date strictly before the store-local today, so the customer review
  (mobile) and web-shop subscribe screens default to today and validate
  against today; the "Today" chip sits before "Tomorrow". Store/admin manual
  create forms already default to today; the store renewal edit form still
  defaults to tomorrow.
- Skipping the **only** delivery on a route used to leave the emptied run at
  `READY_FOR_PICKUP` with a stale `totalStopCount`, so the admin workload
  (`RiderService.findAllWithWorkload`) and `reconcileRiderOperationalStatus`
  both still counted it as rider work and the rider stayed BUSY with nothing
  to deliver (only a later heartbeat released them). `cancelRiderArtifactsWithinTransaction`
  now detects that the run has no live stops left, cancels it, and reconciles
  the rider in the same transaction. Regression:
  `subscription-skip-frees-rider.e2e.spec.ts`.

## Rider-photo completion must advance the order

The `RIDER_PHOTO_GPS` branch of `delivery-run-operations.service.ts` used to
mark the delivery job `DELIVERED` with a raw `tx.deliveryJob.update`, which
bypassed `DeliveryWorkflowService.transitionWithinTransaction`. That helper is
what advances the linked `Order` to `DELIVERED` and writes its status history
(it also finalizes inventory and reconciles the rider). The stop, job and
delivery all read DELIVERED while the customer's order stayed
`OUT_FOR_DELIVERY` with an `OUT_FOR_DELIVERY->OUT_FOR_DELIVERY` history row.
Route the job transition through the shared workflow instead. Regression:
`rider-photo-complete-order-status.e2e.spec.ts`. The inventory finalizer is a
zero-delta no-op for this path, so routing through the workflow is safe.

## Offline-customer purge must keep emails unique

`permanentDeleteCustomer` has two branches: with historical orders it anonymizes
the user row in place (orders are retained for financial records), otherwise it
hard-deletes. The anonymize branch used to write a fixed `purged@offline.local`
address, so purging a **second** order-bearing offline customer 500'd on
`User.email`'s unique constraint. The placeholder is now
`offline.purged.<customerId>@aagaam.local` — unique per purge and still matching
the `offline.` prefix in `offlineIdentity`, so the anonymized row stays
addressable from the store directory. Purged test rows are hard to clean up
afterwards (the anonymized email no longer contains your seed tag); seed order
rows with a tag and delete them via the order before asserting.

`CodLedger.expectedAmountPaise` and `CustomerSubscription.amountDuePaise` both
have CHECK constraints (`> 0` and `>= 0`). Minting a COD ledger for a prepaid
day (`cashDuePaise = 0`) or decrementing due below zero rolls the transaction
back as an opaque HTTP 500; guard on the cash actually due rather than assuming
the invariant holds.


## Every completion writer must advance the order, not just the stop

There are several ways a subscription day gets marked delivered — rider OTP,
rider-photo/GPS, Trusted Drop, and the store-grid / rider "Mark delivered"
quick action (`POST /store/subscriptions/deliveries/:id/quick-action`
`TOGGLE_DELIVERED`, `StoreMilkGridService.executeQuickAction`). Each must route
the stop's `deliveryJobId` through
`DeliveryWorkflowService.transitionWithinTransaction`; that is the only thing
that advances the linked `Order`, writes its status history and finalizes
inventory. The quick action now does this via `advanceOrderForQuickAction`
(before that it left the Order at `OUT_FOR_DELIVERY`) and reverses it on undo
via `revertOrderStatusForQuickAction`. When adding a completion path, do not
raw-update `deliveryJob.status`.

## DeliveryRun is unique per rider

The `DeliveryRun` unique key is
`(storeId, serviceDate, slotStart, deliveryCluster, deliverySlot, riderId)`.
Dropping `riderId` (the pre-`20261008000000` shape) means only one rider can be
dispatched per store/date/slot: a second rider's `deliveryRun.create` collides
on the unique index and the whole `dispatchToRider` transaction rolls back with
an opaque HTTP 500, which is also what broke store "Reassign". Postgres treats a
NULL rider as distinct, which is why planner runs (riderless) and dispatched
runs don't collide. `dispatch-second-rider.e2e.spec.ts` is the regression.

## Don't serialise whole Prisma models to a store owner

`GET /orders/delivery-operations/queue` leaked rider `bankAccountCiphertext` /
`bankIfscCiphertext` because `currentRider` was `include`d whole (its `user`
sub-select was already scoped). Any store/admin read path that returns a rider
must `select` only the display fields. Same class as the `.../summary` leak.

## Preview the mobile-partners RN screens on the web

`apps/mobile-partners` is a bare React Native app with no web target, so there is
no way to eyeball its screens without an emulator (unavailable: no KVM). To
render the *real* screens (same components/styles/copy as the APK) in a browser,
use the harness at `agent_demo_shots/rn-preview/`:

The harness is a throwaway local scaffold: `agent_demo_shots/` is listed in
`.gitignore`, so a clean checkout does **not** contain it — it must be
recreated by hand (or restored from a machine that still has it) before the
commands below run. It is not required to build or test the app.

- `mocks/rn-shim.js` aliases `react-native` to `react-native-web`; the other
  `mocks/*.js` stub native modules (`WebView`, safe-area, geolocation, Firebase,
  react-navigation, toast) and the `@aagam/mobile-shared` / `@aagam/utils`
  packages. Service singletons (`riderService`, `notificationService`,
  `RiderTrackingManager`, `RiderOnlineService`, native pickers/scanners, …) are
  aliased to `mocks/native-services.js`.
- `src/gallery.jsx` mounts the actual screen components. It overrides
  `Text`/`ScrollView` to render plain `<div>`s (react-native-web renders `<Text>`
  as `<div>`, and nested `<Text>` would produce invalid nested divs) and flattens
  their `style` arrays with `StyleSheet.flatten` before handing them to the DOM.
- Build: `cd agent_demo_shots/rn-preview && ../../node_modules/.bin/webpack --config webpack.config.js`.
- Screenshots: `node shoot.js` (Playwright element shots → `screens/*.png`).
- Live Mapbox map: pass a public token as `?mapbox=pk.…` on the gallery URL; the
  token is read at runtime by `mocks/env.js` (`window.__MAPBOX_TOKEN__`).
- Deps (`react-native-web`, `babel-loader`, `webpack-cli`, `html-webpack-plugin`,
  `@babel/preset-react`, `@babel/preset-typescript`) are installed with
  `--no-save`; re-install them in one `npm install` if a later install prunes
  them (npm removes unlisted `--no-save` packages).

### Live proxy: the real app against the real backend

The gallery above renders individual screens from mock data. To run the *whole*
app — real `App.tsx`, real `RootNavigator`, real `@aagam/mobile-shared/apiClient`
— wired to the live `https://aagaam.in/api`, use the second, separate config:

- Build: `EXPO_PUBLIC_MAPBOX_TOKEN=pk.… ../../node_modules/.bin/webpack --config webpack.preview.config.js`
  → `dist-live/`. Entry `src/web-entry.js` mounts `<App/>` (with an error
  boundary that prints failures into `#boot-error`), and `@app` is aliased to
  `apps/mobile-partners`.
- Serve + proxy: `node server.js` (port `12001`; `MAPBOX_TOKEN=…`). The
  production API sends **no CORS headers**, so the browser cannot call it
  cross-origin; `server.js` proxies `/api/*` to `https://aagaam.in` on the same
  origin and the app's `API_URL` is baked to `/api`. It also injects
  `window.__ENV__` (Mapbox token) into `index.html` at serve time, so no rebuild
  is needed to change the token. `run.sh` does build + serve in one step.
- Live rebuild while developing: `node dev-server.js` is `server.js` plus a
  webpack **watch** compiler, so saving any file under `apps/mobile-partners`
  (or `packages/mobile-shared`) recompiles the bundle and connected browsers
  reload automatically (Server-Sent Events on `/__live`; the injected client
  polls `/__build-id`). Run it with the same env as `server.js`
  (`PORT`, `API_ORIGIN`, `STRIP_API_PREFIX=1`, `MAPBOX_TOKEN`,
  `AAGAM_RIDER_TOKEN`) and share the work-host URL — edits appear in seconds
  with no manual rebuild. It binds port `12001`, so stop `server.js` first.
- `@react-navigation/native-stack` must alias to `mocks/navigation.js`
  (`createNativeStackNavigator`); a dummy passthrough `Screen` renders nothing.
- Probes: `node probe-live.js` (render + errors + backend calls),
  `node probe-interactive.js` / `probe-flows.js` (drive UI, RIDER_EMAIL/… env),
  `node capture-live.js` (device screenshots → `screens/live-*.png`).
- Dev hooks on the live bundle: `?map=1` mounts `RiderRouteMap` alone;
  `?screen=route` mounts the new `RouteConsoleScreen` (and `&demo=1` seeds a
  sample run so the populated console renders without a rider token).
- Full-screen mode: the `#fs-toggle` button (also the `F` key, or
  `?fullscreen=1`) adds `html.fs`, which drops the device-frame chrome and
  shows only the app screen edge-to-edge.
- Static design prototypes live in `rn-preview/static/` (served at
  `/static/<name>.html`, never wiped by the webpack build). The current one is
  `handover-sheet.html` — the "Handover Sheet" rider-stop design, a single
  self-contained HTML file that calls the real rider API via same-origin
  `/api`. With no token it opens a built-in fleet demo (no failed requests);
  add `?token=<JWT>` (stored in `localStorage.aagam_rider_token`) to drive the
  live `getTodayRuns` → `getRun` → `arrive`/`otp`/`complete`/`extra-milk`/
  `cash-accountability` endpoints. Verify with
  `node probe-handover.js` (renders, map tiles, flow, 0 errors).
- `rn-preview/static/rider-gallery.html` is the multi-screen version: a
  to-scale phone with a sidebar to walk **every rider screen** — the 6 tabs
  (Home, Route, Runs, Alerts, Earnings, Profile) plus the drill-downs (Run
  detail, COD ledger, Payout history, Schedules, Documents, Support,
  Notification settings, Tracking diagnostics). It is live by default: the
  preview server injects a rider JWT into `window.__ENV__.AAGAM_TOKEN` (from
  the `AAGAM_RIDER_TOKEN` env var) so every screen renders real data via
  same-origin `/api`; `?demo=1` forces the built-in fleet dataset instead, and
  `?screen=<key>` deep-links a screen. Verify with `node probe-gallery.js`
  (all 14 screens render live, 0 errors).
- `rn-preview/static/rider-app.html` is the **redesign concept** (not a
  re-skin): a navy/emerald design system built on the brand's real mark colour
  `#061B36`, with the actual `aagam-mark.png` logo (`rn-preview/static/brand/`)
  surfaced in every header. Each screen gets its own layout idea (Home = today
  dial + one NOW action, Runs = shift timeline, COD = cash ring, Earnings =
  sparkline). Same live/demo wiring as the gallery. Verify with
  `node probe-app.js`. The Route Handover sheet also models cash capture
  (paid-in-full vs partial/over -> variance), field add-on milk (pack, unit
  price, repeat days, current vs next slot), and the COD screen models the
  deposit batch; Run detail shows a prepaid/pre-book concept card. Verify the
  flows with `node probe-app-cash.js`.
- **rider-app.html v2 (wired to the real DTOs):** the Route Handover sheet now
  emits exact contracts — `arrive`/`fail` include `latitude`/`longitude`;
  `complete` sends `{version,riderConfirmed,otpCode?,evidenceId?,cashCollectedPaise?,latitude,longitude}`;
  partial cash fires a chained `record-payment {amountPaise,paymentMode:'CASH'|'PHONE_PE',note}`;
  add-on fires `extra-milk {extraQuantity,extraPaise,consecutiveDays,targetSlot}`;
  plus `toggle-slot`, `skip`, and customer `contact`. `?sim=1` = demo data +
  real writes (payload capture). `node probe-bodies.js` asserts the emitted
  bodies; `node probe-shots.js` renders screens `screens/v2-*.png`.
- **Typography caveat (fixed):** the CSS requested `"Plus Jakarta Sans"` but the
  page never loaded it — on machines without the font installed it silently fell
  back to Segoe UI/Helvetica (invisible in a sandbox that happens to have it).
  Now loaded via Google Fonts `<link>` with `preconnect`. Any future screen must
  keep the webfont link, not rely on the local system.
- **Horizontal rails:** `.chips` / `.maprail` use `scroll-snap-type: x proximity`
  + `touch-action: pan-x pan-y` so vertical swipes still scroll the page, and the
  `rails()` helper adds an edge-fade (`--paper` / map gradient) when content
  overflows to the right — so "upcoming stops" read as more-to-the-right.
- **Partial payment / cash-due reality (verified):** subscription cash is a
  *ledger of dues*, not a per-stop exact toggle. The real partial-payment API is
  `POST /rider/delivery-runs/:runId/stops/:stopId/record-payment` with
  `{ amountPaise, paymentMode: 'CASH'|'PHONE_PE', note }` (service
  `DeliveryRunOperationsService.recordPayment`, DTO `RiderRecordPaymentDto`).
  It increments `subscriptionDelivery.cashCollectedPaise` and decrements
  `subscription.amountDuePaise` (never below 0), and for CASH mints/extends the
  COD ledger. The run controller also has `POST .../toggle-slot`,
  `POST .../skip`, `GET rider/delivery-runs/route-board`.
  **The rider mobile app does NOT call `record-payment`** — it can only complete
  a stop for the full `cashDuePaise`. Only the admin rider console
  (`RiderRunConsole.tsx`, `(rider)/rider/runs`) and the store milk grid
  (`MilkDeliveryGrid.tsx`) expose partial CASH/PhonePe recording.
- **Rider API contract (verified from controllers + DTOs + schema):**
  - Portal (`riders/portal`, Role.RIDER): `home`, `offers`, `offers/:id`,
    `delivery`, `deliveries`, `history[/:jobId]`, `receipts/:jobId`, `pickup(s)`,
    `pickup/:jobId/verify|problem`, `earnings`, `cod`, `performance`,
    `availability`, `availability/status`(PATCH), `availability/schedule`(PATCH),
    `availability/break/start|end`, `profile`(GET/PATCH), `documents`,
    `documents/:id/preview`, `contact/:jobId`, `support[/:id[/messages]]`.
  - Runs (`rider/delivery-runs`, Role.RIDER): `route-board?date`, `today?date`,
    `cash-batches`(GET), `:runId`, `:runId/pickup|start|finish`,
    `:runId/stops/:stopId/arrive|otp|trusted-drop-evidence|complete|fail|reorder|extra-milk|toggle-slot|record-payment|skip`,
    `:runId/cash-accountability`, `:runId/cash-batches`,
    `cash-batches/:batchId/submit`.
  - Key DTOs: `RunVersionDto{version}`; `ConfirmRunPickupReceiptDto{version,expectedBagCount,crateCode?}`;
    `ArriveRunStopDto{version,latitude,longitude,accuracyMetres?}`;
    `CompleteRunStopDto{...arrive,riderConfirmed,otpCode?(\d{6}),trustedDropToken?,evidenceId?,cashCollectedPaise?,note?}`;
    `FailRunStopDto{...arrive,reason:DeliveryFailureReason,note?,retryRequested?}`;
    `RiderExtraMilkDto{extraQuantity:string,extraPaise?,note?,consecutiveDays?(1-30),targetSlot?:'AM'|'PM'}`;
    `RiderToggleSlotDto{targetSlot?:'AM'|'PM'}`; `RiderRecordPaymentDto{amountPaise,paymentMode?:'CASH'|'PHONE_PE',note?}`;
    `skip` body `{reason?,note?}` (no DTO).
  - Money is integer **paise** everywhere; run/stop carry optimistic `version`.
    Payment state comes from `order.payment.status: PaymentStatus`
    (`PENDING_COD` = collect cash; `CAPTURED`/`SUBSCRIPTION_FUNDED` = prepaid).
    COD status enum: AWAITING_COLLECTION, HELD_BY_RIDER, PARTIALLY_DEPOSITED,
    SETTLED, VARIANCE_REVIEW.
  - **Mobile app gaps (wired vs not):** the app wires arrive/otp/trusted-drop/
    complete/fail/**reorder**/start/finish/extra-milk/cash-accountability/
    cash-batches. It does **NOT** wire `record-payment`, `toggle-slot`, `skip`,
    or `route-board`; and stop completion always sends the full `cashDuePaise`
    (no partial). Only admin `RiderRunConsole`/store `MilkDeliveryGrid` do
    partial CASH/PhonePe.
- **Store-side milk operations (verified):** offline customers are created by the
  store (`POST store/subscriptions/manual-customer`, `CreateManualOfflineCustomerDto{name,phone(10 digits),line1,...}`);
  online customers self-register. Rider assignment is store-controlled:
  `available-riders`, `rider-assignments`, `dispatch-to-rider`,
  `:subscriptionId/default-rider`, `:subscriptionId/temporary-rider`,
  `auto-dispatch-default-riders`. The **Milk Board** is `GET store/subscriptions/grid?year&month`
  → `{year,month,daysInMonth,totalSubscribers,rows,dailyTotals}` where each row has
  `customerType:'offline'|'online'` (via `isOfflineSubscription`), `defaultRider`/
  `temporaryRider`, and per-day cells `{deliveryId,status,baseQuantity,extraMilk,
  cashCollectedPaise,cashDuePaise,paymentMode('CASH'|'PHONE_PE'|'DUE'),planLabel,
  assignedRider,photoProof}`; `dailyTotals` carry totals incl. `totalLiters`,
  `totalCollectedPaise`, `totalDuePaise`. Per-customer statement
  `GET customer/:id/statement` → completed/skipped counts, extraLiters,
  totalPaidRupees, totalDueRupees, WhatsApp text. Store override of any cell:
  `POST store/subscriptions/deliveries/:id/quick-action` (STORE_OWNER|ADMIN|RIDER)
  with `TOGGLE_DELIVERED|SKIP|EXTRA_MILK|TOGGLE_SLOT|RECORD_PAYMENT|VOID_PAYMENT|ATTACH_EVENING_MILK`;
  store can record a payment on a customer's behalf via `subscribers/:id/record-payment`.
  Cash: store `GET cash-batches` + `POST cash-batches/:batchId/verify` (SETTLED or
  VARIANCE_REVIEW) + admin variance compensation; stop return `runs/:runId/stops/:stopId/return`.
  Proof mode is resolved from the delivery method in `customer-subscription.service.ts`
  (`proofMode()`): `TRUSTED_DROP`→geofence+token+photo, `SECURITY_RECEPTION`→OTP+GPS,
  everything else (personal handover, store/offline/manual/custom/renewal subs)
  →`RIDER_PHOTO_GPS`. There is **no customer OTP on store-assigned deliveries**;
  the rider's photo + GPS is the handover proof. Offline/manual delivery rows are
  stamped `RIDER_PHOTO_GPS` in `subscription-admin-reporting.service.ts`.
  Money audit trail: `GET store/subscriptions/subscribers/:subscriptionId/audit`
  (STORE_OWNER|ADMIN, store-scoped) → newest-first `SubscriptionAuditEntry` rows
  (`action`, `reason`, `metadata`, `actor`, `createdAt`); written by cash funding,
  grid quick-actions and admin ops. The customer app does **not** choose a
  handover/proof method (`proofMode` chooser removed from
  `SubscriptionReviewScreen`/`SubscriptionDetailScreen`); it sends
  `PERSONAL_HANDOVER` unless the plan forbids it.
- Login is email+password or phone-OTP against live `/auth/mobile/login`; the
  seed default (`rider@aagam.com`) is *not* a production credential, so the
  authenticated rider dashboard needs a supplied test account password.
  `dorabbu4@gmail.com` is the known admin login and can be reused as a backend
  source for QA test accounts if present in the production DB.

- Login is email+password or phone-OTP against the environment's
  `/auth/mobile/login`; the seed default (`rider@aagam.com`) is *not* a
  credential there, so the authenticated rider dashboard needs a supplied test
  account password.

### QA against RouteConsoleScreen must not use production

`RouteConsoleScreen` can start a run, record arrival GPS, and complete a stop
for the authenticated rider's real assignments, which mutates delivery state,
subscription entitlements, COD cash records, and customer-visible order status.
Run its QA (and the live proxy above) against **staging** URLs, data and
credentials only. A QA rider account must be provisioned in the staging
database, never pulled from production; do not reuse a production admin login
(`dorabbu4@gmail.com` or similar) for this workflow.

### Rider "go online" needs approved documents

`PATCH /riders/portal/availability/status` to `ONLINE` and
`POST /riders/me/heartbeat` are both gated by
`rider-operations-eligibility.ts`, which requires four APPROVED, unexpired
`RiderDocument` rows (`DRIVING_LICENSE`, `IDENTITY`, `VEHICLE_REGISTRATION`,
`VEHICLE_INSURANCE`). Without them the gateway returns **409** with
`reasons: [*_MISSING]`, so the dashboard toggle silently snaps back to Offline.
The local demo seeder (`apps/api-gateway/demo-seed.flow.ts`) now creates those
documents for `rider@aagam.com` and leaves the profile `OFFLINE` (never seed a
rider `ONLINE`; `ONLINE`/`BUSY` also blocks `dispatchToRider`).

### Preview harness route params

`agent_demo_shots/rn-preview/mocks/navigation.js` is a hand-rolled navigator; it
must keep `navigate(name, params)` params for the **tab** branch, otherwise any
screen that reads `route.params` (e.g. `RiderRunDetailScreen.runId`) receives
`undefined` and fetches `/delivery-runs/undefined` (404 → "Route unavailable").
The geolocation mock there must resolve a position (not error), since the web
preview has no real GPS for the online/route-location flows.


### Rider notifications now live in Profile (hidden tab)

The rider tab bar no longer has an `Alerts` tab. `PartnerNotificationsScreen`
is registered as a **hidden** `Notifications` tab in `RiderNavigator` and opened
from the Profile row / the delivery-flow bell via `navigation.navigate("Notifications")`.
It renders its own back button that calls `navigation.goBack()`; in the preview
harness that only works because the tab mock keeps a tab history and routes
`goBack`/`canGoBack` through it (see `mocks/navigation.js`).

### Live route map + upcoming stops on the run detail

`RiderRunDetailScreen` renders `RiderRouteMap` (Mapbox) with the live rider dot
(from `Geolocation.watchPosition`) plus numbered stop markers (`stops` prop ->
`RiderMapStop[]`: `done`/`current`/`upcoming`) and an "Upcoming stops" horizontal
rail. Stop coordinates come from `deliveryLatitude/Longitude`, falling back to the
subscription `addressSnapshot.latitude/longitude`. The preview WebView mock
implements `injectJavaScript` so live map updates behave in the browser.

Each map marker shows the customer name in a `.stop-label` badge (current stop in
red, done/upcoming in teal/white) so riders see names, not just numbers. Both the
main map and the stop-sheet map mirror the run's progress via the
`progressDone`/`progressTotal` props, which drive the in-map `window.setRouteProgress`
badge (`N / M delivered`).

### Rider arrival quick actions + skip

The next-stop card and each upcoming card expose **Deliver** (records arrival, then
the sheet advances to the proof step) and **Skip** (opens the `SKIP STOP` modal).
`skipStop(runId, stopId, { reason, note, version })` posts to
`POST /rider/delivery-runs/:runId/stops/:stopId/skip`; the controller accepts a plain
`{ reason?, note? }` body (no whitelisted DTO), so the extra `version` is harmless.
The full-stop sheet is essentials-first: map, contact/extra/proof chips, then a
"More details" gate; there is **no** content above the map.

Partial cash: the rider **can** record a partial cash payment. The stop sheet shows
the outstanding balance and a validated amount input; the rider cannot enter more
than what is still owed on the stop. The client sends the entered
`cashCollectedPaise` with the completion `POST` and the server also enforces the cap
(`recordPayment` rejects an amount above the stop's `cashDuePaise - cashCollectedPaise`),
so over-collection is blocked on both sides.

Multiple subscriptions per customer: one customer can hold two subscriptions (a
different plan, or the same plan in another slot); each becomes its own stop. Both
`RiderRunDetailScreen` and `RouteConsoleScreen` detect the repeat customer and
disambiguate by labelling every stop with its own plan (`subscription.plan.name`) or
slot, plus a "2 subscriptions" badge on the duplicated customer's cards/rail chips.
The gateway `ownedRun(...)` payload includes the subscription plan/slot for this.

### Local demo / preview environment (ports 12000 + 12001)

The partner web previews need both a static server and a **local, seeded** API:

- **12000** — `python3 -m http.server 12000` in `agent_demo_shots/`; serves the
  rider UI/UX design prototypes. `index.html` links the key deliverable,
  `run-console.html` ("Rider Run Console — single-page map": all customers pinned on
  one Leaflet/OSM map, tap-to-deliver, sequence rail).
- **12001** — `node server.js` in `agent_demo_shots/rn-preview/`. It serves
  `dist-live/` and proxies `/api/*`. It MUST be started with
  `API_ORIGIN=http://127.0.0.1:3005 STRIP_API_PREFIX=1 MAPBOX_TOKEN=<pk...>`
  (`run.sh` holds the Mapbox token) or the map has no token and there is no data.
  Proxying to `https://aagaam.in` only serves that server's own (usually empty) data.
  To render the gallery pages with *live* data, also pass `AAGAM_RIDER_TOKEN=<rider JWT>`;
  the proxy injects it as `window.__ENV__.AAGAM_TOKEN`. Mint a fresh one against the
  **local** API (the JWT arrives as the `access_token` cookie, not in the body):
  `curl -c jar -X POST localhost:3005/auth/login -H 'content-type: application/json' \
   -d '{"email":"<RIDER_EMAIL>","password":"<RIDER_PASSWORD>"}'` then read `access_token` from the jar.
- **3005** — the API gateway. Run from the prebuilt bundle with the demo DB:
  `source apps/api-gateway/.env.demo` (or export the vars), then
  `node dist/src/main.js`. Requires `DATABASE_URL` and `JWT_SECRET` (≥32 chars).
  `nest start` fails unless `@nestjs/cli` is installed at the root — prefer `dist/src/main.js`.

Reprovision the demo database (Postgres on `:5433`):

```
createdb -h /tmp -p 5433 aagam_local
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/aagam_local?schema=public \
  npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
# base catalog + accounts, using the configured demo logins
STORE_EMAIL=... STORE_PASSWORD=... RIDER_EMAIL=... RIDER_PASSWORD=... \
  ADMIN_EMAIL=... ADMIN_PASSWORD=... CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=... \
  NODE_ENV=development node packages/database/seed.js
# subscription/delivery demo flow (creates today's run + deliveries); honours the
# same STORE_EMAIL / RIDER_EMAIL overrides
cd apps/api-gateway && npx ts-node --transpile-only --project tsconfig.json demo-seed.flow.ts
```

`scripts/seed-demo.sh` runs both seeders in one step. The demo login emails are the
configured accounts (`AAGAM_CREDENTIALS`), not the `*@aagam.com` defaults; the
seeder reads the passwords from `ADMIN_PASSWORD` / `STORE_PASSWORD` /
`CUSTOMER_PASSWORD` / `RIDER_PASSWORD` (or one shared `SEED_DEMO_PASSWORD`) and never
prints them. The guardian rider route-board is date-scoped, so a stale run from a
previous day shows an empty board — re-run the demo flow to create today's run.

Demo route note: the seeded `m009` run (`Anakapalle Hub`) drifts into an inconsistent
state after repeated QA (stop `READY` but `deliveryJob`/`order` `DELIVERED`), which
makes `/arrive` return `409 Delivery job is not approaching the customer` or
`409 Order is DELIVERED`. Reset stops 3-8 to `READY`/`PLANNED`,
`deliveryJob=OUT_FOR_DELIVERY`, `order=OUT_FOR_DELIVERY` before testing arrival.

### Restoring the local stack from cold (sandbox restarts wipe it)

A sandbox restart stops every process and drops the ephemeral services, which the
preview proxy surfaces as **"Bad Gateway"**. The whole stack is local and must be
brought back in order — Postgres and Redis are NOT provisioned by default:

```
# 1. Postgres (installs 17), listen on 5433 to match DATABASE_URL
sudo apt-get update && sudo apt-get install -y postgresql redis-server
sudo sed -i 's/^port = .*/port = 5433/' /etc/postgresql/17/main/postgresql.conf
sudo pg_ctlcluster 17 main start
sudo -u postgres psql -p 5433 -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres createdb -p 5433 aagam_local
sudo redis-server --daemonize yes --port 6379   # the gateway refuses to boot without it

# 2. Schema + data (from repo root)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/aagam_local?schema=public" \
  npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
source apps/api-gateway/.env.demo   # DATABASE_URL, JWT_SECRET, PORT, demo logins, AAGAM_RIDER_TOKEN
node packages/database/seed.js
(cd apps/api-gateway && npx ts-node --transpile-only --project tsconfig.json demo-seed.flow.ts)

# 3. Gateway (prebuilt bundle — `nest start` is unavailable)
cd apps/api-gateway && set -a && source .env.demo && set +a && node dist/src/main.js &

# 4. Preview on 12001 (dev-server.js = webpack watch + /api proxy), static on 12000
#    Mint the rider JWT from the LOCAL gateway first (arrives as the access_token cookie):
#    curl -c jar -X POST localhost:3005/auth/login -H 'content-type: application/json' \
#      -d '{"email":"<RIDER_EMAIL>","password":"<RIDER_PASSWORD>"}'
cd agent_demo_shots/rn-preview
PORT=12001 API_ORIGIN=http://127.0.0.1:3005 STRIP_API_PREFIX=1 \
  MAPBOX_TOKEN=<pk from run.sh> AAGAM_RIDER_TOKEN=<rider JWT> node dev-server.js &
cd agent_demo_shots && python3 -m http.server 12000 &
```

The Playwright browser cache is also wiped on restart: re-run
`npx playwright install chromium-headless-shell` before capture/probe scripts.

## Browser preview of the mobile apps (react-native-web)

`mobile-web-preview/` bundles the real `apps/mobile-customer` and
`apps/mobile-partners` code with react-native-web and serves them through a
same-origin proxy to the api-gateway. `./run.sh` builds both and serves on
`:12001`: partners at `/preview/mobile-partners/`, customer at
`/preview/mobile-customer/`. `server.js` forwards `/api/*` and `/socket.io/*` to
`API_ORIGIN` (default `http://127.0.0.1:3005`) with `STRIP_API_PREFIX=1` (local
gateway has no `/api` prefix), injects `window.__ENV__`, and streams live
reload. `API_URL` is baked to `/api` so the bundle is same-origin.

Key points:
- `mocks/navigation.js` reuses the real `@react-navigation/core` builder;
  `Screen`/`Group` come from `createNavigatorFactory` because core's public index
  does not export them (a `Stack.Screen` of `undefined` throws inside the nav).
- `mocks/keychain.js` must expose named exports (`setGenericPassword`, …)
  because `mobile-shared/store/authStore.ts` uses `import * as Keychain`.
- `apps/mobile-partners/src/components/StoreKit.tsx` does not exist on this
  branch or on `main`/`bugs`, though `StoreDeliveriesScreen` /
  `ManageSubscriberSheet` import it. A compatibility shim (Button, Field, Sheet,
  TextField, money, Chip, SectionTitle, StatTile, InfoRow, OptionCard,
  SegmentedTabs) was added so the store workspace compiles — swap in the real
  implementation when it lands.
- Authenticated flows need role credentials; the previews otherwise render the
  login/onboarding screens. Signing in with a real account (or the configured
  `AAGAM_*` logins) exercises the full navigators against the live DB.
- `playwright` needs the `chrome` channel (`npx playwright install chrome`) for
  the MCP browser, not just `chromium-headless-shell`.


