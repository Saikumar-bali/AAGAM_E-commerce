# Verification V1 Architecture

## Scope

Phase V1 keeps AAGAM as the authority for partner applications, users, roles, sessions, JWTs and authorization. Firebase Phone Number Verification (PNV) supplies only a signed proof of an Android device phone number. It does not create or authenticate AAGAM users.

## Inspection summary

Before V1, partner contact codes were stored directly on `PartnerApplication`, Resend and Twilio errors were surfaced as generic delivery failures, and the partner Android app used code entry only. Firebase configuration and signing SHA-1/SHA-256 proof already existed for Android release workflows, but no PNV dependency or native bridge existed.

## Provider-neutral persistence

The partner-onboarding subsystem already uses raw SQL migrations/repositories rather than Prisma models. V1 follows that established pattern and creates a persisted `VerificationChallenge` table plus typed repository without adding generated Prisma accessors.

`VerificationChallenge` records one verification attempt without storing an OTP, provider credential, full destination, Firebase token or raw nonce.

Fields:

- `id`, `applicationId`
- `method`: `EMAIL_CODE`, `EMAIL_LINK`, `FIREBASE_PNV`, `SMS_OTP`
- `provider`: `QA`, `RESEND`, `TWILIO`, `FIREBASE_PNV`
- `destinationHash`, `nonceHash`, `tokenJti`, `providerDeliveryId`
- `status`: `CREATED`, `DISPATCHING`, `SENT`, `VERIFIED`, `FAILED`, `EXPIRED`, `SUPERSEDED`
- `attemptCount`, `expiresAt`, `verifiedAt`, `failureCode`, timestamps

Only a successful provider acceptance supersedes an older valid contact-code challenge. Therefore, a failed resend does not invalidate the code that was already delivered.

## HTTP contracts

- `GET /partner-onboarding/verification-capabilities`
- `POST /partner-onboarding/applications/:id/contact-code`
- `POST /partner-onboarding/applications/:id/verify-contact`
- `POST /partner-onboarding/applications/:id/phone-pnv/challenge`
- `POST /partner-onboarding/applications/:id/phone-pnv/verify`
- `GET /ready/verification`

Application endpoints require `Authorization: Application <access-token>`. Access is checked before Firebase token parsing so a valid PNV token cannot be used against another application.

## Firebase PNV sequence

1. AAGAM creates a short-lived single-use nonce, stores only its SHA-256 hash and returns the raw nonce to the authorized application session.
2. The Kotlin React Native bridge calls Firebase PNV `getDigitalCredentialPayload(nonce)`.
3. Android Credential Manager obtains user consent using a Digital Credential request containing the same nonce.
4. The bridge extracts the Firebase credential response and calls `exchangeCredentialResponseForPhoneNumber()`.
5. The app sends only the signed Firebase PNV token to AAGAM.
6. `firebase-admin@13.8.0` verifies the token signature and Firebase contract. AAGAM then independently enforces issuer, both required audience values, expiry, nonce ownership, unused `jti`, application-session ownership and exact phone equality.
7. `phoneVerifiedAt` is written only after every check passes.

Official contracts:

- Android setup: https://firebase.google.com/docs/phone-number-verification/android/get-started
- Custom nonce flow: https://firebase.google.com/docs/phone-number-verification/android/custom-flow
- Android API: https://firebase.google.com/docs/reference/android/com/google/firebase/pnv/FirebasePhoneNumberVerification
- Admin Node API: https://firebase.google.com/docs/reference/admin/node/firebase-admin/phone-number-verification

## Fallback

PNV is preferred on Android when the backend is configured and the device reports at least one supported SIM. Unsupported, declined and recoverable native failures expose an explicit SMS fallback. Selecting it records `VERIFICATION_FALLBACK_SELECTED`, then Twilio delivery follows the same challenge lifecycle as email.

## Diagnostics and privacy

Provider failures log only provider, HTTP status, sanitized provider error code, correlation ID, application ID and timestamp. Logs and events never contain OTPs, API keys, authorization headers, full contact values or PNV tokens.

`GET /ready/verification` exposes only configured booleans, provider names, QA-mode status and the last successful provider check timestamp.

## QA safety

QA uses deterministic code `424242` unless `PARTNER_QA_VERIFICATION_CODE` overrides it. Code exposure is allowed only outside production when `NODE_ENV=test` or `PLAYWRIGHT_QA=true`. Production validation rejects `PLAYWRIGHT_QA` and `PARTNER_QA_VERIFICATION_CODE`.

Firebase test-session IDs are accepted only at runtime by a `BuildConfig.DEBUG`-guarded native method. They are never embedded in source, resources, `BuildConfig` or APK assets.
