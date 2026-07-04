# Phase 7.2 Realtime Readiness

Branch: phase7a

Implemented:

- `GET /ready/realtime`
- Pings Redis using `REDIS_URL` or local default
- Returns ready only when Redis responds
- Returns HTTP 503 when Redis is unavailable
- Keeps database readiness at `/ready` separate from realtime readiness

Why this matters:

- `/ready` checks database-backed API readiness.
- `/ready/realtime` checks live tracking and Socket.IO Redis readiness.

Local proof commands:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
npm run dev --workspace=apps/api-gateway
curl http://localhost:3005/health
curl http://localhost:3005/ready
curl http://localhost:3005/ready/realtime
```

Expected:

- `/health` returns `status: ok`
- `/ready` returns `status: ready` when database is connected
- `/ready/realtime` returns `status: ready` when Redis is connected
- `/ready/realtime` returns HTTP 503 when Redis is not connected

Pending:

- local proof from user
- merge after proof
