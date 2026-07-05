# Phase 14 Predeploy Audit

Branch: predeploy-audit

No deployment in this phase.

Scope:

- static readiness audit
- optional live readiness probe
- env checklist
- role journey checklist

Run:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npm run test:api-smoke
npm run predeploy:audit
npx turbo build --force
```

Live probe when API is running:

```bash
PREDEPLOY_BASE_URL=http://localhost:3005 npm run predeploy:audit:live
```

Role journeys:

- customer order and tracking
- store fulfillment
- admin dispatch analytics support notifications
- rider pickup location delivery

Status: pending proof.
