# Verification V1 Testing Runbook

## Temporary production mode: Mailjet email OTP

Until AAGAM has an owned sending domain and a supported phone-verification path for Indian operators, partner onboarding runs in email-only mode.

Required production settings:

```text
PARTNER_EMAIL_PROVIDER=MAILJET
MAILJET_API_KEY
MAILJET_SECRET_KEY
PARTNER_VERIFICATION_FROM_EMAIL=<exact sender address validated in Mailjet>
PARTNER_VERIFICATION_FROM_NAME=AAGAM Verification
PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY
```

`MAILJET_API_KEY` and `MAILJET_SECRET_KEY` must be stored as secrets. The selected provider, validated sender address and sender name may be ordinary deployment variables. Never commit provider credentials.

When an owned domain is available, Resend remains supported. Switch with:

```text
PARTNER_EMAIL_PROVIDER=RESEND
RESEND_API_KEY
PARTNER_VERIFICATION_FROM_EMAIL=AAGAM Verification <verify@owned-domain.example>
```

When phone verification is deliberately re-enabled, set:

```text
PARTNER_PHONE_VERIFICATION_MODE=PNV_FIRST
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_PHONE
FIREBASE_PROJECT_ID
FIREBASE_PROJECT_NUMBER
PARTNER_SMS_PROVIDER=TWILIO
```

Never set `PLAYWRIGHT_QA` or `PARTNER_QA_VERIFICATION_CODE` in production.

## Local backend proof

```bash
npm ci --no-audit --no-fund
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma validate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm run build --workspace @aagam/types
npm run build --workspace @aagam/utils
npm run build --workspace @aagam/database
npm run build --workspace @aagam/api-gateway
npm run test:ci --workspace @aagam/api-gateway
npx tsc --project apps/mobile-partners/tsconfig.json --noEmit
npm test --workspace AagamPartners
```

Run migrations against a new PostgreSQL database, not a reused developer database. The `VerificationProvider` enum must include `MAILJET`.

## Mailjet provider proof

Normal push and pull-request CI uses mocked provider responses and does not contact Mailjet. It proves compilation, database migration, provider selection, challenge persistence, production environment validation, error handling and mobile email-only behavior.

The `Mailjet Partner Email Verification` workflow supports a protected manual run:

- `skip`: no provider request.
- `sandbox`: authenticates with Mailjet and validates the request without intentional inbox delivery.
- `live`: sends one non-OTP integration-test email and requires explicit live-send authorization inside the workflow.

Protected GitHub settings for a manual provider proof:

```text
Secrets:
  MAILJET_API_KEY
  MAILJET_SECRET_KEY
  MAILJET_TEST_TO_EMAIL

Variables:
  PARTNER_VERIFICATION_FROM_EMAIL
  PARTNER_VERIFICATION_FROM_NAME
```

A skipped provider step is not proof of Mailjet API acceptance or inbox delivery. A sandbox success proves credentials and request acceptance but not inbox receipt. A live success proves Mailjet accepted the message; the recipient must still confirm inbox or spam-folder receipt.

## Email-only behavior

Expected scenarios:

1. The app reads `/partner-onboarding/verification-capabilities` before offering verification methods.
2. `EMAIL_ONLY` hides the phone field and phone verification choice.
3. The API rejects phone-only applications before inserting a draft.
4. The API rejects SMS OTP and Firebase PNV challenge requests while email-only mode is active.
5. Mailjet acceptance stores the provider delivery ID and only then supersedes an older valid OTP.
6. Mailjet rejection leaves an older successfully delivered OTP valid.
7. The response never exposes an OTP in production.
8. A valid code marks `emailVerifiedAt`; invalid attempts are limited and expiring challenges are rejected.

## Android PNV proof for future reactivation

```bash
cd apps/mobile-partners/android
gradle signingReport
gradle assembleDebug testDebugUnitTest --stacktrace
```

For a Firebase PNV test session, generate a short-lived test number ID in Firebase Console and pass it to the debug app at runtime. Do not commit it. The device or emulator must meet Firebase test-session requirements.

## Provider regression matrix

Backend tests cover accepted, rejected, network-error and unconfigured Mailjet responses; Mailjet HTTP-success/message-error responses; sender parsing; retained Resend support; Twilio responses; Firebase token claims; nonce mismatch; replayed JTI; exact phone mismatch; application-token ownership; QA exposure; production non-exposure; challenge preservation; attempt limits; email-only guards; and secret-free readiness output.

## GitHub Actions artifacts

The Mailjet workflow uploads:

```text
mailjet-verification-proof-<head-sha>
```

The artifact contains build, migration, test, configuration and provider-proof logs. The provider-proof log explicitly records `NOT RUN` when protected Mailjet testing was not requested.

The original Firebase workflow continues to upload:

```text
verification-v1-backend-proof-<head-sha>
verification-v1-android-proof-<head-sha>
```

A provider or device artifact that says `NOT RUN` must never be presented as real end-to-end proof.
