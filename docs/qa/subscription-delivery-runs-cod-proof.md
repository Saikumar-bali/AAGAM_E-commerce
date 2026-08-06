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

## Required exact-head CI proof

The connector-authored commit containing this document intentionally triggers the repository's normal pull-request workflows. Merge remains blocked until the exact PR head proves:

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
- required review approval with no unresolved threads.

Any material review correction must produce a new exact-head run of the complete required suite.
