# AAGAM Deployment Runbook

This document prepares deployment only. Do not deploy until the final deployment phase is explicitly approved.

## Services

- API Gateway: NestJS app from `apps/api-gateway`
- Admin Dashboard: Next.js app from `apps/admin-dashboard`
- Database: managed PostgreSQL
- Realtime/cache: managed Redis

## Required provider secrets

API secrets:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`

Admin secrets:

- `NODE_ENV=production`
- `PORT`
- `NEXT_PUBLIC_API_URL`

## API build and start

Build command:

```bash
npm install
npm run build:api
```

Start command:

```bash
npm run railway:start:api
```

The API start command validates production env, runs Prisma migrations, then starts the API.

## Admin build and start

Build command:

```bash
npm install
npm run build:admin
```

Start command:

```bash
npm run start:admin
```

## Preflight gates

Run before deployment:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npm run test:api-smoke
npm run predeploy:audit
npm run deploy:prep
npx turbo build --force
```

Run when API is online with Postgres and Redis:

```bash
DEPLOY_PREP_API_URL=https://your-api-domain.example.com npm run deploy:prep:live
```

## Required live checks

The final API deployment must return success for:

- `/health`
- `/ready`
- `/ready/realtime`

If `/ready/realtime` fails, do not route production traffic.

## Cutover hold points

Stop before deployment if any are true:

- `DATABASE_URL` points to localhost
- `REDIS_URL` points to localhost
- `JWT_SECRET` is shorter than 32 characters
- `CORS_ORIGINS` does not include frontend domains
- `NEXT_PUBLIC_API_URL` points to localhost
- `/ready/realtime` fails
- smoke tests fail

## Post-deployment proof

Required proof after deployment:

- env validation passed
- database migrations deployed
- `/health` passed
- `/ready` passed
- `/ready/realtime` passed
- auth smoke test passed
- RBAC smoke tests passed
- customer journey passed
- store journey passed
- admin journey passed
- rider journey passed
