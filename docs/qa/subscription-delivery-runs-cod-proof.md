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

The guarded correction completed successfully and produced source commit `9bb689bdae413a95e825527ec2c42f066ab565e0`. Before publication it verified the compressed patch checksum, installed the locked dependency graph, generated and validated Prisma, compiled the internal `types`, `utils`, and `database` workspaces, and completed the API production build. All temporary correction workflows were removed from the resulting tree.

The first clean-head Playwright attempt reached the migrated and seeded database but found one invalid QA fixture enum: `SubscriptionDelivery.proofMode` used nonexistent `CUSTOMER_OTP_GPS`. The schema defines `PERSONAL_OTP_GPS` for personal handover. The guarded correction completed successfully and produced source commit `6601c98694a8c7cdbe05bfdd31ad6862bc059f1f` after verifying exactly one replacement, all migrations, the base database seed, the complete Playwright QA seed, JavaScript syntax, and a clean diff. Its temporary workflow was removed from the resulting tree.

The next exact-head API regression run proved production build and migrations but exposed legacy tests that still constructed `CheckoutService` before `OrderCreationService` was extracted, plus one source contract that still looked for the outbox write in checkout instead of the shared authoritative transaction. The compatibility correction keeps explicit Nest injection in production, provides a stateless default only for direct legacy test construction, recognizes the old three-argument promotions fixture, and updates the contract to require checkout delegation plus the atomic `ORDER_PLACED` outbox write in `OrderCreationService`.

The guarded compatibility run completed successfully and produced source commit `3d5e7a4142ae0b59f959a6848f4f3a8dbb8d1d4b`. It passed the locked dependency install, Prisma generation/validation and fresh migration, internal package compilation, API production build, and the complete API service suite before publishing the two-file correction. Its temporary workflow was removed from the resulting tree.

The final Playwright rerun passed 100 tests and isolated three browser release gates. The admin subscription dashboard discarded every successful subscription response because a form-support request used nonexistent `/delivery-zones`; it now uses the authoritative `/stores/delivery-zones/admin` endpoint. The pending full-plan customer detail now states truthfully that remaining deliveries become subscription funded with customer amount due ₹0 only after the first verified cash collection. The responsive navigation contract now counts and explicitly asserts the intentional fifteenth Admin link, Subscriptions.

A targeted browser guard verifies the patch checksum, fresh migrations and both seed layers, internal package compilation, production API/dashboard builds, the responsive-navigation suite, and all four subscription role flows before it may publish these corrections. Its temporary workflow is removed from the resulting tree.

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
