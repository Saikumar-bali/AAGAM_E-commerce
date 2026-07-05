# Phase 17 — Customer Mobile App

Branch: customer-mobile

Scope:

- customer-only mobile signup
- signup auto-login after backend account creation
- customer-only auth session guard
- phone-login readiness notice for Firebase Phone Number Verification
- customer notifications tab
- mark notification read
- corrected mobile order tracking endpoint
- mobile order feedback/support screen
- delivered-order feedback action

Firebase phone note:

Firebase Phone Number Verification can verify a phone number without SMS on supported carrier flows, but Aagam still needs backend token verification before issuing its own JWT. Do not enable phone login until the backend endpoint verifies Firebase PNV tokens.

Local checks:

```bash
npm install
npx prisma validate --schema=packages/database/prisma/schema.prisma
npm test
npx turbo build --force
npm run android --workspace=apps/mobile-app
```

Manual mobile flow:

- sign up as customer
- login as customer
- browse products
- add to cart
- checkout COD
- view orders
- open order tracking
- submit rating/support after delivery
- open notifications
- mark notification read

Status: pending proof.
