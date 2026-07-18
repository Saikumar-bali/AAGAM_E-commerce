# AI Run — Professional Partner Onboarding E2E

Date: 2026-07-18
Branch: `phase-partner-onboarding-e2e`
Draft PR: #71

## Objective

Replace unsafe Rider/Store self-registration with an application-first workflow covering mobile applicant pages, Admin review, approval provisioning, one-time activation, and verified operational login.

## Architecture delivered

- Public `/auth/signup` creates Customer accounts only.
- Applicant access uses a separate application token and cannot enter Rider/Store APIs.
- Partner applications have an explicit, audited state machine.
- Contact verification, document evidence, review decisions and corrections are recorded.
- Bank, IFSC and tax values are encrypted before persistence and masked in responses.
- Admin approval provisions a disabled account and RiderProfile or Store.
- Admin does not set a permanent password.
- Applicant activates using a single-use token and creates the password.
- Partner login rejects accounts that have not completed activation.

## Mobile pages delivered

1. Partner welcome
2. Rider/Store application start
3. Contact verification
4. Rider application
5. Store application
6. Document upload/replacement
7. Application status and timeline
8. Action-required correction/resubmission
9. Resume application
10. Account activation
11. Approved-partner login

## Admin pages delivered

- Partner application queue
- Search/type/status filters
- Application detail workspace
- Profile and contact review
- Document preview and decisions
- Correction request
- Rejection
- Approval and provisioning
- Audit timeline

## Automated scenarios

The acceptance test creates both Rider and Store applications through live APIs, verifies contacts, updates sensitive payloads, uploads required documents, submits idempotently, reviews documents through the Admin browser UI, provisions accounts, activates them and confirms role-specific operational access.

## Evidence locations

- API/Jest contract test: `apps/api-gateway/src/partner-onboarding/partner-onboarding.contract.spec.ts`
- Playwright E2E: `apps/admin-dashboard/e2e/partner-onboarding-e2e.spec.ts`
- Screenshots: `docs/qa/phase-4/partner-onboarding-*.png`
- Compile diagnostics workflow: `.github/workflows/partner-onboarding-diagnostics.yml`

## Verification status

The dedicated API/Admin/mobile compilation workflow passed on commit `24997cc3e74abcb918797e4d8257919dce522abe`.

Final test counts, workflow runs, artifacts, and any defects discovered by CI must be appended after the acceptance commit executes. The PR must remain draft until every required workflow is green.
