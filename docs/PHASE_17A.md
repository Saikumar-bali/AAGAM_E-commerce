# Phase 17A Customer App

Branch: customer-app-complete

Target:

- apps/mobile-customer

Keep:

- apps/mobile-partners for operations
- apps/mobile-app stays until proof passes

Scope:

- signup then login JWT fix
- phone login readiness notice
- Alerts tab
- notification inbox
- mark read
- Review screen

Run:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
npm run android --workspace=apps/mobile-customer
```

Status: pending proof.
