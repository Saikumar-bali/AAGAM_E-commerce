# Phase 5 — Security Hardening Review

**Date:** 2026-06-29
**Branch:** `phase-5-production-readiness-deployment`

## Security Checklist

### 1. CORS Configuration

**Current State:** `apps/api-gateway/src/main.ts:65-84`

| Mode | Behavior | Risk |
|------|----------|------|
| Development | `origin: true` (allows ALL) | Acceptable for local dev |
| Production | Whitelist from `CORS_ORIGINS` env var | Safe if configured correctly |
| Production fallback | Empty array `[]` (blocks all) | Fail-closed ✓ |

**Fix Applied:** Added `maxAge: 86400` to reduce preflight requests.
**Status:** ✅ Safe

### 2. Cookie Security

**File:** `apps/api-gateway/src/auth/auth.controller.ts:38-44`

| Property | Production | Development |
|----------|-----------|-------------|
| `httpOnly` | `true` | `true` |
| `secure` | `true` | `false` |
| `sameSite` | `'none'` | `'lax'` |
| `path` | `'/'` | `'/'` |
| `maxAge` | 7 days | 7 days |

**Status:** ✅ Safe — cookies are httpOnly, secure in production

### 3. Throttler Defaults

**File:** `apps/api-gateway/src/app.module.ts:28-32`

| Tier | Default | QA Override |
|------|---------|-------------|
| short (1s) | 3 requests | 500 requests |
| medium (10s) | 20 requests | 2000 requests |
| long (60s) | 60 requests | 10000 requests |

**Auth-specific:**
- Login/Signup: 3/min (production)
- Google OAuth: 10/min
- Profile update: 5/1s

**Status:** ✅ Safe — QA override gated by `PLAYWRIGHT_QA=true`

### 4. QA Override Safety

**File:** `apps/api-gateway/src/app.module.ts:29`

```typescript
limit: process.env.PLAYWRIGHT_QA === 'true' ? 500 : 3
```

**Protection:**
- `PLAYWRIGHT_QA` is never set in production
- Environment validation in `main.ts` now blocks startup if `PLAYWRIGHT_QA=true` in production
- QA seed script (`qa-seed.js`) refuses to run in production

**Status:** ✅ Safe — triple-gated

### 5. JWT/Session Expiry

**Token lifetime:** 7 days (set in cookie `maxAge`)
**JWT signing:** Uses `JWT_SECRET` env var (min 32 chars enforced)
**Token format:** HTTP-only cookie (not accessible via JavaScript)

**Status:** ✅ Safe — 7-day expiry is reasonable for e-commerce

### 6. Role Guards

**File:** `apps/api-gateway/src/auth/guards/roles.guard.ts`

| Endpoint | Guard | Required Role |
|----------|-------|---------------|
| `GET /auth/users` | JwtAuthGuard + RolesGuard | ADMIN |
| `POST /orders/:id/force-cancel` | JwtAuthGuard + RolesGuard | ADMIN |
| `POST /orders/:id/reassign-rider` | JwtAuthGuard + RolesGuard | ADMIN |
| Store endpoints | JwtAuthGuard | Store Owner |
| Rider endpoints | JwtAuthGuard | Rider |

**Status:** ✅ Safe — role-based access control in place

### 7. Upload Limits

**File:** `apps/api-gateway/src/upload/upload.controller.ts`

- Max file size: Configured via NestJS `ValidationPipe`
- File types: Images only (multer config)

**Status:** ⚠️ Needs review — verify upload size limits are set

### 8. Input Validation

**File:** `apps/api-gateway/src/main.ts:59-63`

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,        // strips unknown properties
  forbidNonWhitelisted: true,  // throws on unknown properties
  transform: true,        // auto-transforms to DTOs
}));
```

**Status:** ✅ Safe — strict validation enabled

### 9. Sensitive Logging

**File:** `apps/api-gateway/src/auth/auth.controller.ts:31-32,46-47`

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[AuthController] Login attempt');
}
```

**Status:** ✅ Safe — auth logs only in development

### 10. Secrets Exposure Risk

| Secret | In Code? | In .env? | In .gitignore? |
|--------|----------|----------|----------------|
| JWT_SECRET | No | Yes | Yes |
| DATABASE_URL | No | Yes | Yes |
| REDIS_URL | No | Yes | Yes |
| CORS_ORIGINS | No | Yes | Yes |
| Google OAuth | No | Yes | Yes |

**Status:** ✅ Safe — no secrets in code

## Issues Found & Fixed

### Fixed in This Phase

1. **CORS production fallback** — Was empty array (blocks all). Now fails startup if `CORS_ORIGINS` not set in production.
2. **Environment validation** — Added fail-fast validation for critical env vars.
3. **CORS maxAge** — Added 24-hour preflight cache to reduce requests.

### Remaining Items (Not Blocking)

1. **Throttler Redis store** — Currently in-memory only. Multi-instance deployments need Redis-backed throttler.
2. **Upload size limits** — Should be explicitly configured.
3. **Request ID tracking** — Not implemented (helpful for debugging).
4. **Security headers** — Consider adding `X-Content-Type-Options`, `X-Frame-Options`, etc.

## Recommendations

1. Add `helmet` middleware for security headers
2. Configure throttler with Redis store for multi-instance
3. Add request ID middleware for tracing
4. Set up dependency vulnerability scanning (npm audit)
5. Add rate limiting per IP (not just per route)
