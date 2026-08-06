# Subscription Delivery Runs and COD Cash Control — PR Proof

## Scope

Pull request: #209  
Implementation commit: `37ad530d89490609392233cc772eb2feca61aff2`

The implementation commit was rebuilt directly on the then-current `main` commit and contains the complete database, backend, web, Customer Android, Partners Android, test, and release-documentation change set. Temporary source-transfer workflows and payload files are not part of the implementation tree.

## Local pre-CI validation

The following checks completed before publication:

- TypeScript and TSX parser validation across 533 source files: no syntax failures.
- Subscription architecture/security contract assertions: 9 of 9 passed.
- Subscription calendar and integer-paise allocation unit cases: 4 of 4 passed.
- `git diff --check`: clean.
- Changed-file comparison between the local implementation and PR #209: exact match.

A full local `npm ci` could not be used as release proof because the execution environment could not resolve the public npm registry and its configured mirror did not contain `react-test-renderer@19.0.0`. No test, dependency, or CI requirement was weakened to hide that infrastructure failure.

## Review corrections

The first exact-head Customer Experience contract run found one customer-facing legacy brand literal in `SubscriptionDetailScreen.tsx`. Commit `3b976c9b3ad8b84532216b5b47c0a1a7e4c5ba92` changes “AAGAM operations” to the repository’s canonical “Aagaam operations” copy.

The later exact-head build exposed a shared strict-TypeScript cluster in the subscription/order backend. The correction validates all dynamic JSON before Prisma writes, preserves full enum types during state-membership checks, restores the expected COD-ledger include shape, and rejects delivery failure completion when the authoritative decision record cannot be resolved.

The first guard used the wrong workspace build order. The second guard corrected the order and proved dependency installation and Prisma generation, but its isolated helper job lacked the environment value required by `prisma validate`. The v3 guard supplies a non-production CI database URL, validates the same compressed-patch checksum, and may commit source only after Prisma validation, all internal package compilations, and the API production build pass.

## Required exact-head CI proof

Merge remains blocked until the exact PR head proves:

- dependency lockfile installation;
- Prisma generation and validation;
- PostgreSQL migration safety;
- API tests and production build;
- admin/customer/store/rider web validation;
- Playwright subscription role flows and screenshots;
- Customer Android typecheck/tests/build;
- Partners Android typecheck/tests/build;
- production UX contracts;
- CodeQL and repository security checks;
- zero unresolved actionable review threads.

Codex review is non-blocking for this pull request at the repository owner's instruction. Any material correction must still produce a new exact-head run of the complete required suite.
