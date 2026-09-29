# Documentation

Documentation for the AAGAM platform, grouped by purpose.

## `architecture/`

How the system is put together and the contracts it must honour.

- `DELIVERY_API_CONTRACT.md` — delivery API surface
- `DELIVERY_DOMAIN_STATE_MACHINE.md` — order/delivery state transitions
- `DELIVERY_ROLE_PERMISSIONS.md` — who may perform which delivery action
- `NOTIFICATION_OUTBOX_ARCHITECTURE.md` — notification delivery pipeline
- `PARTNER_ONBOARDING_ARCHITECTURE.md` — partner onboarding design
- `VERIFICATION_V1_ARCHITECTURE.md` — identity/verification design
- `AUTO_DISPATCH_RECOVERY_AND_E2E.md` — dispatch recovery and its E2E coverage
- `REGIONAL_MULTI_RIDER_ROUTE_SPLITTING.md` — regional routing model
- `RIDER_APP_VISUALISATION_AND_FREE_MAPS.md` — rider map stack
- `DELIVERY_OPERATIONS_GAP_ANALYSIS.md` — open gaps in delivery operations
- `PROFESSIONAL_ECOMMERCE_ROADMAP.md` — product roadmap
- `ARCHITECT_CLI_AI_PROTOCOL.md` — the CLI/AI working protocol

## `runbooks/`

Operational procedures for deploying and configuring the platform.

- `DEPLOYMENT_RUNBOOK.md`, `DEPLOYMENT_AUTOMATION.md` — deploy procedure
- `PHASE_7_PRODUCTION_READINESS.md`, `PHASE_14_PREDEPLOY.md`,
  `PHASE_15_DEPLOYMENT_PREP.md`, `PHASE_13_QA_HARDENING.md` — readiness gates
- `FIREBASE_PRODUCTION_CREDENTIALS.md` — Firebase setup
- `MAILJET_EMAIL_VERIFICATION.md` — email verification setup (pair with
  `scripts/test-mailjet-verification.js`)
- `MOBILE_ANDROID_RELEASES.md` — Android release process

## `phases/`

Per-phase implementation notes. These record what each delivery phase changed
and are useful when tracing why a subsystem looks the way it does.

## `qa/`

Generated QA evidence: Playwright screenshots, result JSON, and manual
end-to-end test notes. The admin-dashboard Playwright specs write their proof
artifacts here, and CI uploads `qa/phase-4/` as a build artifact. Treat this
directory as generated output rather than hand-written documentation.

## `cli-ai/`, `mobile-customer/`

Working prompts and phase plans for mobile app work.

## `archive/`

Historical, dated records that are no longer current:

- `archive/ai-runs/` — timestamped agent run logs
- `archive/*.md` — superseded phase documents
