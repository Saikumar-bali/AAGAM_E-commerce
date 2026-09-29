# Architect ↔ CLI-AI Protocol

This repository is being completed phase by phase under architect review. CLI-AI must treat this file as the working contract.

## Goal
Build a professional quick-commerce/e-commerce system in the style of Blinkit, Zepto, Instamart, Zomato grocery/food operations, and enterprise marketplace operations.

Do not copy brand names, logos, UI assets, copyrighted flows, or proprietary designs. Build a functional equivalent: customer ordering, store inventory, checkout, payments, rider operations, live tracking, admin operations, support, reporting, and production-grade reliability.

## Non-negotiable workflow

1. Never push directly to `main`.
2. Work on one phase branch only.
3. Keep every phase small enough to review in one pass.
4. Do not start a later phase until the current phase is reviewed and accepted.
5. Do not claim completion without proof.
6. Do not modify unrelated files to make builds pass.
7. Do not print secrets from `.env`, Railway, Firebase, database URLs, JWT secrets, API keys, or role credentials.
8. Use existing credentials only for local/manual testing. Mask all emails/passwords/tokens in reports.
9. Use Prisma migrations for schema changes. Do not rely on production `db push` as the main release method.
10. Preserve order/payment/history records. Do not hard-delete business history.

## Required proof after every CLI-AI run

CLI-AI must submit this proof in `docs/ai-runs/YYYY-MM-DD_<phase-name>.md`:

- Branch name.
- Base commit SHA.
- Final commit SHA.
- Short summary of what changed.
- Exact files changed.
- Commands run and final result.
- API proof with masked tokens.
- Playwright proof where UI is touched.
- GitHub Actions proof when pushed.
- Database migration proof when schema changes.
- Screenshots or saved artifacts for UI/user-flow work.
- Known limitations and honest failures.

## Minimum verification commands

Run the applicable commands for the changed phase:

```bash
npm install
npm run build:api
npm run build:admin
npx turbo build
```

When tests are added, also run:

```bash
npm test
```

For API and security phases, run targeted API tests or documented curl/Postman checks.

For UI phases, run Playwright headed mode and attach screenshots/videos:

```bash
npx playwright test --headed --trace on
```

## Manual role testing requirements

Use available role credentials from local environment only. Never paste raw credentials in reports.

Required role coverage over the full project:

- Admin.
- Customer.
- Store owner.
- Rider.

Each phase must specify which roles were tested.

## Architect review rule

A phase is not accepted until the architect verifies:

- Code diff.
- Build/test proof.
- Security impact.
- Data correctness.
- User flow behavior.
- No unrelated changes.
- No fake/hardcoded success claims.
