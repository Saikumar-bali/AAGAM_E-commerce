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

### Checking a run

`GET /api/automation/v1/{automation_id}/runs?limit=5` gives `status` and
`current_phase`. `Timed out: command timed out or was killed` means the run hit
the 1800s cap. The prompts therefore push their fixes before reporting, so work
survives a timeout, and treat 20 minutes as their own deadline.