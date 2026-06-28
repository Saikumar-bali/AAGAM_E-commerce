# 2026-06-28 — Phase 1 Architect Brief

## Starting point

Last reviewed commit:

`9613392b92348d0bd0cc7bc9d1c14292160588c2`

Commit message summary:

- Auth session persistence.
- Rate limit adjustment for `/auth/me`.
- Bearer token from localStorage for web requests.
- Rider history page.
- Rider profile page.
- React Native config/new architecture adjustment.

## Architect decision

Proceed phase by phase.

Do not attempt to complete the full quick-commerce system in one CLI-AI run.

The next implementation phase is:

`Phase 1 — Security, Tenancy, Soft Delete, and Inventory Foundation`

Detailed task file:

`docs/phases/PHASE_1_SECURITY_INVENTORY_FOUNDATION.md`

Workflow contract:

`docs/ARCHITECT_CLI_AI_PROTOCOL.md`

## Why this is first

The app already has enough functional surface area to become dangerous if more features are added without controls.

Before payment gateway, coupons, rider earnings, or final replica UI, the backend must protect:

- Role-based access.
- Store-owner data boundaries.
- Business history.
- Inventory audit trail.

## Instruction to CLI-AI

Create a new implementation branch from `main` after pulling the latest changes.

Recommended branch:

`phase-1-security-inventory-foundation`

Implement only the scope in the phase file. Submit proof in a new run report file before requesting architect review.

## Required proof before architect review

CLI-AI must provide:

- Final branch name.
- Final commit SHA.
- GitHub Actions result.
- Build output summary.
- Test output summary.
- Migration name/result.
- API proof for RBAC and tenancy.
- Playwright proof only if UI changed.
- Honest list of anything not completed.

## Review rule

No phase is accepted from summary alone. The architect will verify code, docs, and proof from GitHub.
