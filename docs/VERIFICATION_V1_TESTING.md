# Verification V1 Testing Runbook

## Environment

Production requires:

```text
RESEND_API_KEY
PARTNER_VERIFICATION_FROM_EMAIL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_PHONE
FIREBASE_PROJECT_ID
FIREBASE_PROJECT_NUMBER
PARTNER_PHONE_VERIFICATION_MODE=PNV_FIRST
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

Run migrations against a new PostgreSQL database, not a reused developer database.

## Android proof

```bash
cd apps/mobile-partners/android
gradle signingReport
gradle assembleDebug testDebugUnitTest --stacktrace
```

For a Firebase PNV test session, generate a short-lived test number ID in Firebase Console and pass it to the debug app at runtime. Do not commit it. The device or emulator must be enrolled in the Google system services public beta required by Firebase PNV test mode.

Expected device scenarios:

1. Supported PNV: consent -> signed token -> backend confirmation -> `phoneVerifiedAt` visible.
2. Unsupported PNV: SMS fallback button visible.
3. Consent declined: clear error and SMS fallback visible.
4. Backend rejection: no verified UI state.
5. Successful backend response: refresh application and continue.
6. Release build: `enablePnvTestSession` rejects.
7. QA email code: deterministic code appears only in QA.

## Provider regression matrix

Backend tests cover accepted, rejected and unconfigured Resend/Twilio responses; valid and invalid Firebase claims; nonce mismatch; replayed JTI; exact phone mismatch; application-token ownership; QA exposure; production non-exposure; resend preservation; attempt limits; and secret-free readiness output.

## GitHub Actions artifacts

The `Verification V1 Firebase PNV` workflow uploads:

- `verification-v1-backend-proof-<head-sha>`
- `verification-v1-android-proof-<head-sha>`

The Android artifact explicitly records `NOT RUN` when the protected Firebase PNV test-session secret or suitable device runner is unavailable. That artifact is not proof of signed-token device E2E success.
