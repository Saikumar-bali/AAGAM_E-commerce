# AAGAM E-Commerce

Multi-app commerce platform for grocery/essentials delivery: customer and
partner mobile apps, a store/admin web dashboard, a NestJS API gateway, and a
background worker.

## Repository layout

This is an npm-workspaces TypeScript monorepo orchestrated with Turbo.

| Path | What it is |
| --- | --- |
| `apps/api-gateway` | NestJS backend. Owns the business logic and the majority of automated tests. |
| `apps/admin-dashboard` | Next.js web dashboard for admins, store owners, and internal operations. |
| `apps/mobile-customer` | Expo / React Native customer app. |
| `apps/mobile-partners` | Expo / React Native partner (store/rider) app. |
| `apps/worker-service` | Background worker for queued jobs. |
| `packages/database` | Prisma schema, migrations, and seed scripts. |
| `packages/types` | Shared Zod schemas and TypeScript types. |
| `packages/utils` | Shared utilities and API client. |
| `packages/ui` | Shared UI primitives. |
| `packages/mobile-shared` | Code shared between the two mobile apps. |
| `scripts/` | Build, deploy, security, and release tooling. |
| `docs/` | Architecture references, runbooks, and archived change logs. |
| `deployment/`, `production/` | Environment templates and production service definitions. |

## Prerequisites

- Node.js 24.x and npm 11.x
- Docker (for Postgres/Redis in local development and testing)
- [Turbo](https://turbo.build/) is installed as a dev dependency; use `npx turbo`.

## Getting started

```bash
npm install

# Build the shared packages first — the api-gateway depends on their compiled
# output and will not typecheck until they are built.
npm run build --workspace=packages/types
npm run build --workspace=packages/utils
npm run build --workspace=packages/ui
npm run build --workspace=packages/database   # also runs `prisma generate`
```

Start a local Postgres and apply migrations:

```bash
sudo docker run -d --name aagam-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=aagam_ci -p 5433:5432 postgres:15-alpine

export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/aagam_ci?schema=public"

# Apply migrations (not `db push`) so the schema matches CI.
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

Copy `.env.example` to `.env` and fill in the values for the services you run.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run all apps in watch mode (excluding the mobile apps). |
| `npm run build` | Build the API gateway and its dependencies. |
| `npm run build:all` | Build every workspace with Turbo. |
| `npm run build:admin` | Build the admin dashboard and its dependencies. |
| `npm run test` | Validate the Prisma schema and run the api-gateway CI suite. |
| `npm run test:api` | Run the api-gateway Jest suite. |
| `npm run test:ci --workspace=apps/api-gateway` | CI-safe api-gateway suite. Needs `DATABASE_URL`. |
| `npm run security:dependencies` | Verify dependency security overrides. |

`test:ci` takes several minutes. Run it in the background and poll the log
rather than blocking a terminal.

### Running the api-gateway tests

The suite needs a reachable Postgres. Without `DATABASE_URL` the run produces
hundreds of `PrismaClientInitializationError` failures that look like real bugs.
Always build the workspace packages and apply migrations first, as shown above.

## Deployment

Production deploys run through `.github/workflows/`. `ci.yml` builds every
workspace and runs the service, dependency, and Playwright smoke suites.
`deploy.yml` runs on successful `main` builds and executes `deploy.sh`.
Environment templates live in `deployment/`; production service definitions
live in `production/`.

## Conventions

- Migrations are written idempotently (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`) so
  `migrate deploy` succeeds even if the DDL was applied manually.
- Subscription balances shown to users must be derived through
  `reconcileSubscriptionBalance`, never read from the raw ledger columns. See
  `AGENTS.md` for the details.
- Do not commit build output. `dist/`, `.next/`, and generated `.js`/`.d.ts`
  files in package `src/` directories are ignored and produced by the build.

## Additional documentation

See [`docs/`](docs/README.md) for architecture references and runbooks, and
[`AGENTS.md`](AGENTS.md) for contributor and automation notes.
