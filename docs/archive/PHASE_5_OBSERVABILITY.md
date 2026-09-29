# Phase 5 — Observability Foundation

**Date:** 2026-06-29
**Branch:** `phase-5-production-readiness-deployment`

## 1. Health Endpoint Expectations

### `GET /health`
Returns comprehensive health status including database and Redis connectivity.

**Response Format:**
```json
{
  "status": "ok|degraded|fail",
  "timestamp": "2026-06-29T12:00:00.000Z",
  "uptime": 123456.789,
  "environment": "production",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 5
    },
    "redis": {
      "status": "ok",
      "latencyMs": 2
    }
  }
}
```

### `GET /healthz`
Lightweight liveness probe. Returns `ok` if database is reachable.

**Response Format:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-29T12:00:00.000Z"
}
```

## 2. Database Health Check

**Implementation:** `apps/api-gateway/src/app.service.ts`

- Runs `SELECT 1` query to verify database connectivity
- Measures response latency
- Returns status: `ok` (connected) or `error` (disconnected)

**Monitoring:**
- Alert if `database.status === 'error'` for > 5 minutes
- Alert if `database.latencyMs > 200` consistently

## 3. Redis Health Check

**Implementation:** `apps/api-gateway/src/app.service.ts`

- Runs `PING` command to verify Redis connectivity
- Measures response latency
- Returns status: `ok` (connected), `degraded` (dev mode), or `error` (prod mode)

**Monitoring:**
- Alert if `redis.status === 'error'` in production
- Alert if `redis.latencyMs > 100` consistently

## 4. Structured Production Logs

**Current State:** Console-based logging

**Recommended Structure:**
```json
{
  "level": "info",
  "timestamp": "2026-06-29T12:00:00.000Z",
  "context": "AuthController",
  "message": "Login successful",
  "userId": "user-123",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

**Log Levels:**
- `error` — System errors, database failures, unhandled exceptions
- `warn` — Rate limiting, deprecated usage, non-critical failures
- `info` — Request logging, auth events, order status changes
- `debug` — Development-only detailed logging

## 5. Error Logging Strategy

### API Errors
- Log full error stack in development
- Log error message + context in production (no stack traces)
- Never log: passwords, JWT secrets, credit card numbers

### Database Errors
- Log query that failed (if not sensitive)
- Log connection pool status
- Alert on connection exhaustion

### Redis Errors
- Log connection failures
- Log command failures
- Alert on high memory usage

## 6. What to Monitor After Deployment

### Infrastructure Metrics
- [ ] CPU usage (alert if > 80% sustained)
- [ ] Memory usage (alert if > 85% sustained)
- [ ] Disk usage (alert if > 90%)
- [ ] Network I/O

### Application Metrics
- [ ] Request rate (requests/second)
- [ ] Response time (p50, p95, p99)
- [ ] Error rate (4xx, 5xx)
- [ ] Active connections

### Database Metrics
- [ ] Connection pool usage
- [ ] Query latency
- [ ] Slow queries (> 1s)
- [ ] Migration status

### Redis Metrics
- [ ] Memory usage
- [ ] Connected clients
- [ ] Command latency
- [ ] Eviction rate

## 7. Alert Checklist

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| API Down | Health check fails 3x | Critical | Check Railway logs, restart service |
| High Error Rate | 5xx > 5% for 5 min | Critical | Check error logs, rollback if needed |
| Slow Responses | p95 > 2s for 5 min | Warning | Check database queries, scale if needed |
| Database Unreachable | health.checks.database.status === 'error' | Critical | Check Railway PostgreSQL status |
| Redis Unreachable | health.checks.redis.status === 'error' (prod) | Critical | Check Railway Redis status |
| High Memory | > 85% for 10 min | Warning | Check for memory leaks, scale if needed |
| Migration Pending | prisma migrate status shows pending | Warning | Run pending migrations |

## 8. Monitoring Tools (Optional)

| Tool | Purpose | Cost |
|------|---------|------|
| Railway Metrics | Built-in infrastructure metrics | Free tier available |
| Sentry | Error tracking and performance | Free tier (5k events/month) |
| UptimeRobot | External health check monitoring | Free tier (50 monitors) |
| Grafana + Prometheus | Custom dashboards | Free for small instances |

## 9. Post-Deployment Monitoring Commands

```bash
# Check health
curl -s https://your-app.up.railway.app/health | jq .

# Check migration status
railway run npx prisma migrate status --schema packages/database/prisma/schema.prisma

# View logs
railway logs --service api-gateway

# Check Redis
railway run redis-cli ping
```
