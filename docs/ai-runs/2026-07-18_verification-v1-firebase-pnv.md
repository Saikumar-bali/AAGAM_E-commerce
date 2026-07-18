# AI Run — Verification V1 Firebase PNV

Date: 2026-07-18
Branch: `phase-verification-v1-firebase-pnv`
Base: `main` at `8ee8e10b876dc33db8aeec1e992e64834739cdc3`

## Inspected before implementation

- API partner-onboarding controller, services, repository, DTOs and tests
- Partner verification screen and Zustand onboarding session
- Partner Android Gradle, Kotlin application/package registration and existing native bridge pattern
- Conditional `google-services.json` configuration
- Android release workflow and pinned-keystore SHA-1/SHA-256 generation
- production environment template and validator
- CI migration, build and service-test jobs

## Findings

- Contact verification state was coupled to `PartnerApplication`.
- Resend/Twilio provider rejection was not persisted with structured safe diagnostics.
- `CONTACT_CODE_SENT` existed, but request/failure/PNV/fallback lifecycle events did not.
- Firebase Android configuration existed, but Firebase PNV and Credential Manager integration did not.
- The installed Admin Node SDK is `firebase-admin@13.8.0`, the first release with official Firebase PNV `verifyToken()` support.

## Implemented

- Provider-neutral `VerificationChallenge` migration and lifecycle enums.
- Safe Resend/Twilio diagnostics and correlation IDs.
- Deterministic QA code with production rejection.
- Firebase Admin token verification plus AAGAM nonce, replay, ownership and phone checks.
- Kotlin React Native custom PNV flow with Android Credential Manager.
- SMS fallback and server-confirmed UI state.
- Dedicated verification workflow and proof artifacts.

## Proof status

Workflow links, exact counts and artifact names are appended to the pull request/final report after the exact PR head finishes. A physical-device Firebase PNV test session is not claimed unless the protected runtime token and eligible device runner are available and the workflow artifact contains the resulting evidence.
