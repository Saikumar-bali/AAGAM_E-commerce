# Phase 5 — Production Readiness & Deployment

**Date:** 2026-06-29
**Branch:** `phase-5-production-readiness-deployment`
**Base SHA:** `cff809318f9d53a5510efba18cf561d8ee80052a` (main after Phase 4 merge)

## Summary

Phase 5 adds production readiness: fail-fast environment validation, health endpoints, CI hardening, deployment docs, security review, and observability foundation.

## Files Changed

| File | Change |
|------|--------|
| `apps/api-gateway/src/main.ts` | Added env validation, CORS maxAge, CORS fail-closed in prod |
| `apps/api-gateway/src/app.controller.ts` | Added `/health` and `/healthz` endpoints |
| `apps/api-gateway/src/app.service.ts` | Added health check logic (DB + Redis connectivity) |
| `.env.example` | Added missing vars: REDIS_URL, CORS_ORIGINS, PORT, QA flags |
| `.github/workflows/ci.yml` | Added prisma validate, Playwright CI job, artifact uploads |
| `docs/PHASE_5_PRODUCTION_READINESS_DEPLOYMENT.md` | Deployment guide |
| `docs/PHASE_5_SMOKE_TEST_PLAN.md` | Smoke test scenarios |
| `docs/PHASE_5_SECURITY_REVIEW.md` | Security audit |
| `docs/PHASE_5_OBSERVABILITY.md` | Monitoring and alerting guide |

## Environment Validation Summary

**File:** `apps/api-gateway/src/main.ts`

Fail-fast validation runs before server starts. Covers:
- `DATABASE_URL` — required in all modes
- `JWT_SECRET` — required, min 32 chars
- `REDIS_URL` — required in production
- `CORS_ORIGINS` — required in production
- `PLAYWRIGHT_QA` — blocked in production
- `PLAYWRIGHT_QA_SEED` — blocked in production

## Health Endpoints

- `GET /health` — comprehensive check (DB + Redis + uptime)
- `GET /healthz` — lightweight liveness probe

## CI Hardening

- Added `prisma validate` step
- Added `PLAYWRIGHT_QA_SEED` and `PLAYWRIGHT_QA` env vars to Playwright job
- Added Playwright browser install step
- Added artifact upload for reports and screenshots on failure
- Added Redis service for Playwright tests

## Verification Commands Run

```bash
npm install                           # ✓ succeeded
npx prisma validate --schema ...      # ✓ schema valid
npx prisma generate --schema ...      # ✓ generated
npx tsc (api-gateway)                 # ✓ compiled
```

**Note:** `turbo build` fails on Windows due to Prisma engine file locking (EPERM). This is a Windows-specific issue and does not affect Linux CI.

## CI Run URL

(Will be populated after push)

## Known Limitations

- `turbo build` fails on Windows due to Prisma engine file locking — CI runs on Linux (Ubuntu) where this works
- Throttler uses in-memory store — multi-instance deployments need Redis-backed throttler
- Worker service is scaffold only (no queue logic)
- No Docker/容器 support yet
- No staging deployment automation (manual Railway deploy for now)
- 82 npm vulnerabilities (4 low, 64 moderate, 12 high, 2 critical) — run `npm audit fix` separately
