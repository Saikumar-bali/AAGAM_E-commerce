# Contributing

## Setup

Follow the "Getting started" section of the [README](README.md). In short:
install dependencies, build the shared packages, start Postgres, apply
migrations, then run the suite you are working on.

## Branching and pull requests

- Branch from `main` (for example `feat/…`, `fix/…`, `chore/…`).
- Keep pull requests focused; unrelated refactors belong in their own PR.
- CI (`.github/workflows/ci.yml`) runs the build, the api-gateway service
  suite, the dependency-security audit, and the Playwright smoke tests. A PR
  must be green before merge.
- `deploy.yml` deploys `main` to production after CI passes. Never push
  directly to `main`.

## Before you push

Run the checks for the areas you touched:

```bash
# Shared packages must be built before dependent workspaces will typecheck.
npm run build --workspace=packages/types
npm run build --workspace=packages/utils
npm run build --workspace=packages/ui
npm run build --workspace=packages/database

# API gateway unit/contract/e2e suite (needs DATABASE_URL).
npm run test:ci --workspace=apps/api-gateway

# Mobile app suites.
npm run test --workspace=apps/mobile-customer
npm run test --workspace=apps/mobile-partners

# Dependency security overrides.
npm run security:dependencies
```

`test:ci` takes several minutes; run it in the background and poll the log
rather than blocking a terminal.

## Testing conventions

- api-gateway tests are Jest `*.spec.ts` files run by
  `apps/api-gateway/jest.config.js`.
- admin-dashboard tests are Playwright specs under `apps/admin-dashboard/tests/`
  and `apps/admin-dashboard/e2e/`.
- Mobile tests are Jest specs under each app's `src/`.
- Test real code paths. Avoid mocks unless there is no reasonable alternative,
  and justify them when you use them.
- Do not add throwaway debug specs to the repository root. Put durable tests
  next to the code they cover.

## Code conventions

- Prefer the shared helpers over re-implementing logic. In particular, user
  facing "Paid"/"Due" subscription figures must go through
  `reconcileSubscriptionBalance` (see `AGENTS.md`).
- Write migrations idempotently (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`).
- Do not commit build output. `dist/`, `.next/`, and generated `.js`/`.d.ts`
  files inside package `src/` directories are ignored and produced by the build.
- Match the existing formatting: `.editorconfig` defines the whitespace rules.

## Automation and agent notes

`AGENTS.md` documents repository-specific knowledge for AI agents: how to run
the suite, the subscription-balance rule, migration conventions, and the
automation payloads under `automations/`. Keep it up to date when those
conventions change.
