# Professional Partner Onboarding Architecture

## Purpose

Riders and Store partners do not use customer-style self-registration. They create a restricted application, verify contact information, upload private evidence, submit an immutable snapshot, and wait for Admin review. Operational access is provisioned only after approval and one-time activation.

## Trust boundaries

- `/auth/signup` creates only `CUSTOMER` accounts.
- `/partner-onboarding/**` accepts `Authorization: Application <token>` and can access only one application.
- `/admin/partner-onboarding/**` requires JWT authentication and the `ADMIN` role.
- Rider and Store accounts remain `PENDING_ACTIVATION` until the applicant creates a permanent password.
- Pending, suspended, and closed partner accounts cannot authenticate.

## Lifecycle

```text
DRAFT
  -> SUBMITTED
  -> UNDER_REVIEW
  -> ACTION_REQUIRED -> SUBMITTED
  -> APPROVED -> ACCOUNT_ACTIVATED
  -> REJECTED

DRAFT/SUBMITTED/UNDER_REVIEW/ACTION_REQUIRED -> WITHDRAWN
```

Every material action writes an append-only application event.

## Application data

### Rider

Identity, verified contact, address, operating city, vehicle, emergency contact, availability, experience, encrypted payout details, and vehicle-dependent documents.

### Store

Owner identity, verified contact, legal and display names, business type, physical address, map coordinates, operating capacity, service radius, encrypted settlement details, and business/store evidence.

Document requirements are product configuration. They must not be presented as universal legal advice.

## Security

- Applicant access tokens and verification codes are stored only as hashes.
- Verification codes expire and enforce attempt limits.
- Raw account numbers, IFSC values, and tax identifiers are encrypted using AES-256-GCM.
- Responses expose only masked last-four values.
- Documents use private evidence storage and short-lived signed preview URLs.
- JPEG, PNG, WebP, and PDF are accepted up to 10 MB.
- Document files receive a SHA-256 checksum.
- Admin cannot see or create a permanent password.
- Approval and provisioning are transactional and idempotent.
- Duplicate operational email or phone values block provisioning.

## Database access convention

The onboarding tables are introduced through ordered SQL migrations before they are promoted into the generated Prisma model API. Parameterized `$queryRawUnsafe` calls are used only for row-returning statements. `AagamPrismaClient` preserves explicit generic result types and defaults unannotated row queries to `Array<Record<string, any>>`, avoiding unsafe `unknown` indexing while retaining Prisma's normal typed model methods.

## Provisioning

Rider approval creates a disabled Rider user, approved RiderProfile, and verified RiderDocument records. Store approval creates a disabled Store Owner and inactive Store with operational codes. Applicant activation sets the password, activates the account, and activates the Store when applicable.

## Required acceptance gates

- fresh migration deployment and migration status
- API and mobile TypeScript builds
- role-escalation regression tests
- Rider and Store application scenarios
- document and correction workflow tests
- Admin review and provisioning tests
- activation and operational-login tests
- Playwright Admin UI proof
- Android mobile build/typecheck proof
- CodeQL and complete repository CI
