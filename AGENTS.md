# Repository notes for agents

## Monorepo layout

TypeScript monorepo (npm workspaces):

- `apps/api-gateway` — NestJS, owns most business logic and tests
- `apps/admin-dashboard` — Next.js
- `apps/mobile-customer`, `apps/mobile-partners` — Expo / React Native
- `packages/database` — Prisma schema and migrations
- `packages/types`, `packages/utils`, `packages/ui`, `packages/mobile-shared` — shared packages
  (`packages/ui` is imported by admin-dashboard, `packages/mobile-shared` by both Expo apps)

## Running the api-gateway tests

The suite needs a reachable Postgres. Without `DATABASE_URL` you get ~604
`PrismaClientInitializationError` noise failures that look like real bugs.
Build the workspace packages first, or `@aagam/database` and `@aagam/types`
cannot resolve and `tsc` reports hundreds of unrelated errors.

```bash
npm ci   # matches CI; `npm install` also works

# shared packages must be built before api-gateway will typecheck
# (root `npm run build:api` does exactly these three, in this order)
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

## Migrations

Follow CI: apply migrations with `migrate deploy` (not `prisma db push`), so
tests run against the schema migrations actually produce.

Recent migrations are written idempotently (`ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, and a `DO $$ ... EXCEPTION WHEN duplicate_object`
or `IF NOT EXISTS` guard around foreign keys) so that `migrate deploy` still
succeeds if the DDL was already applied manually. This is the pattern to copy
for new migrations, not a description of the whole directory: most earlier
migrations use plain `ADD COLUMN` / `CREATE TABLE` and are not idempotent.

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