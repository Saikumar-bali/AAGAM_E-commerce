# Phase 13 — QA Hardening

Branch: qa-hardening

Scope:

- Windows-safe Jest scripts
- API smoke tests are opt-in and skip when the API server is offline
- root shortcuts for phase test runs
- sidebar links for new admin and customer pages
- header bell shortcut wired to notifications/work queue

Checks:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npm run test:phase12
npm run test:api-smoke
npx turbo build --force
```

Status: pending proof.
