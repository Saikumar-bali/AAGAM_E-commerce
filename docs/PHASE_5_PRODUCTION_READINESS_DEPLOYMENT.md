# Phase 5 — Production Readiness & Deployment

**Date:** 2026-06-29
**Branch:** `phase-5-production-readiness-deployment`

## 1. Staging vs Production Environments

| Aspect | Staging | Production |
|--------|---------|------------|
| `NODE_ENV` | `staging` or `development` | `production` |
| Database | Separate PostgreSQL instance | Railway-managed PostgreSQL |
| Redis | Separate Redis instance | Railway-managed Redis |
| CORS | `http://localhost:*` + staging URL | `https://*.aagam.com` only |
| Throttler | Default limits | Default limits (no QA override) |
| Logging | Console | Structured JSON (production) |
| SSL | Optional | Required (`sslmode=require`) |

## 2. Railway API Deployment Steps

### Prerequisites
- Railway CLI installed (`npm i -g @railway/cli`)
- Railway project created
- PostgreSQL + Redis services provisioned on Railway

### Deploy Sequence

```bash
# 1. Login to Railway
railway login

# 2. Link to your project
railway link

# 3. Set environment variables on Railway
railway variables set NODE_ENV=production
railway variables set DATABASE_URL="postgresql://..."
railway variables set REDIS_URL="redis://..."
railway variables set JWT_SECRET="<generate with: openssl rand -hex 32>"
railway variables set CORS_ORIGINS="https://admin.aagam.com,https://aagam.com"
railway variables set PORT=3000

# 4. Run database migrations BEFORE deploying
railway run npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# 5. Deploy the API
railway up --service api-gateway

# 6. Verify deployment
curl https://your-app.up.railway.app/health
```

## 3. Postgres Migration Strategy

```bash
# Always use prisma migrate deploy for production (never prisma migrate dev)
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# Check migration status before deploying
npx prisma migrate status --schema packages/database/prisma/schema.prisma

# If migration fails, check logs
railway logs --service api-gateway
```

**Rules:**
- NEVER run `prisma migrate dev` in production
- NEVER run `prisma db push` in production (use migrate deploy)
- Always backup database before major migrations
- Test migrations on staging first

## 4. Redis Requirements

- **Required in production** for: WebSocket adapter, cache, rate limiting
- **Optional in development** (falls back to in-memory adapter)
- Railway provides managed Redis — use `REDIS_URL` from Railway vars
- Health check: `GET /health` includes Redis connectivity status

## 5. Admin Dashboard Deployment

```bash
# Build admin dashboard
cd apps/admin-dashboard
npm run build

# Deploy to Vercel/Netlify/Railway static
# Set NEXT_PUBLIC_API_URL to production API URL
```

## 6. Mobile/Public API URL Handling

- Mobile apps use `NEXT_PUBLIC_API_URL` for API base URL
- Production: `https://your-api.up.railway.app`
- Staging: `https://staging-api.up.railway.app`
- Development: `http://localhost:3005`

## 7. Rollback Plan

```bash
# 1. Rollback Railway deployment to previous version
railway rollback

# 2. If database migration needs rollback:
#    - Create a reverse migration SQL
#    - Run: npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# 3. Verify rollback
curl https://your-app.up.railway.app/health
```

## 8. Emergency Disable Plan

```bash
# To completely disable the API:
railway service delete api-gateway

# To disable specific features via env vars:
railway variables set FEATURE_PAYMENTS=false
railway variables set FEATURE_ORDERS=false

# To block all traffic:
railway variables set CORS_ORIGINS="none"
```

## 9. Secret Rotation

```bash
# Rotate JWT secret:
NEW_SECRET=$(openssl rand -hex 32)
railway variables set JWT_SECRET="$NEW_SECRET"
# All existing tokens will be invalidated — users must re-login

# Rotate database password:
# 1. Update password in Railway PostgreSQL service
# 2. Update DATABASE_URL in API service
railway variables set DATABASE_URL="postgresql://new-password@..."

# Rotate Redis password:
railway variables set REDIS_URL="redis://:new-password@..."
```

## 10. Post-Deploy Verification

```bash
# Health check
curl -s https://your-app.up.railway.app/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "...",
#   "uptime": 123.456,
#   "environment": "production",
#   "checks": {
#     "database": { "status": "ok", "latencyMs": 5 },
#     "redis": { "status": "ok", "latencyMs": 2 }
#   }
# }

# API root
curl -s https://your-app.up.railway.app/

# Auth test (should fail without valid token)
curl -s https://your-app.up.railway.app/auth/me

# Products (public endpoint)
curl -s https://your-app.up.railway.app/products
```
