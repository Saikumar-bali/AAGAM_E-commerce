# Phase 15 — Deployment Preparation

Branch: deployment-prep

No deployment in this phase.

Scope:

- deployment prep checker
- API env example
- admin env example
- deployment runbook
- root deployment prep scripts

Run:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npm run test:api-smoke
npm run predeploy:audit
npm run deploy:prep
npx turbo build --force
```

Live prep check when API is deployed or running:

```bash
DEPLOY_PREP_API_URL=http://localhost:3005 npm run deploy:prep:live
```

Hold gates:

- do not deploy with localhost DB or Redis
- do not deploy with weak JWT secret
- do not deploy while realtime readiness fails
- do not deploy if browser API URL is still localhost

Status: pending proof.
