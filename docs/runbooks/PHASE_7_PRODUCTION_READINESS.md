# Phase 7 — Production Readiness & Deployment Hardening

## Status

Started on branch: `phase-7-hardening`

This phase hardens the project for Railway/VPS deployment, CI confidence, env safety, health checks, database migration safety, Redis/WebSocket readiness, and release operations.

## Checkpoint 7.1 — API Health, Env Validation, CI Entry Points

Implemented:

- `GET /health`
  - process-only health check for uptime/load balancer checks
- `GET /ready`
  - readiness check that verifies database connectivity with Prisma
- `scripts/validate-prod-env.js`
  - fails production startup if required env vars are missing or unsafe
- `npm run check:env:prod`
  - production env validation command
- `npm run railway:start:api`
  - now runs env validation before migration and API start
- `npm test`
  - now maps to CI-safe API validation instead of intentional failure
- `.env.production.example`
  - documents required production variables without secrets

## Required Production Variables

Required for API production start:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET` with at least 32 characters

Recommended:

- `CORS_ORIGINS` for browser clients

## Deployment Smoke Checks

After deployment, run:

```bash
curl https://YOUR_API_DOMAIN/health
curl https://YOUR_API_DOMAIN/ready
```

Expected:

- `/health` returns `status: ok`
- `/ready` returns `status: ready` only when database connectivity is healthy

## Next Checkpoints

1. Verify GitHub Actions run on this branch.
2. Add Redis readiness validation if safe without slowing startup.
3. Add production runbook for Railway and VPS.
4. Add release checklist for DB migrations, rollback, and mobile API URL.
5. Add final Phase 7 proof after CI and local smoke tests pass.
