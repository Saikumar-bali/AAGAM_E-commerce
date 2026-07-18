# Verification V1 Architecture

## Scope

Phase V1 keeps AAGAM as the authority for partner applications, users, roles, sessions, JWTs and authorization. External providers only deliver a verification challenge or supply signed phone proof. They do not create or authenticate AAGAM users.

The current deployment uses Mailjet email OTP and temporarily disables phone verification. Firebase PNV, Twilio fallback and Resend remain implemented for later activation.

## Inspection summary

Before V1, partner contact codes were stored directly on `PartnerApplication`, Resend and Twilio errors were surfaced as generic delivery failures, and the partner Android app used code entry only. Firebase configuration and signing SHA-1/SHA-256 proof already existed for Android release workflows, but no PNV dependency or native bridge existed.

## Provider-neutral persistence

The partner-onboarding subsystem already uses raw SQL migrations/repositories rather than Prisma models. V1 follows that established pattern and creates a persisted `VerificationChallenge` table plus typed repository without adding generated Prisma accessors.

`VerificationChallenge` records one verification attempt without storing an OTP, provider credential, full destination, Firebase token or raw nonce.

Fields:

- `id`, `applicationId`
- `method`: `EMAIL_CODE`, `EMAIL_LINK`, `FIREBASE_PNV`, `SMS_OTP`
- `provider`: `QA`, `RESEND`, `MAILJET`, `TWILIO`, `FIREBASE_PNV`
- `destinationHash`, `nonceHash`, `tokenJti`, `providerDeliveryId`
- `status`: `CREATED`, `DISPATCHING`, `SENT`, `VERIFIED`, `FAILED`, `EXPIRED`, `SUPERSEDED`
- `attemptCount`, `expiresAt`, `verifiedAt`, `failureCode`, timestamps

Only successful provider acceptance supersedes an older valid contact-code challenge. A failed Mailjet or Resend request therefore does not invalidate a code that was already delivered.

## Email provider selection

`PARTNER_EMAIL_PROVIDER` selects the active backend adapter:

```text
MAILJET
RESEND
```

Mailjet is the temporary default while AAGAM uses a sender address individually validated in Mailjet. The backend calls Mailjet Send API v3.1 with server-side Basic authentication, sends both text and HTML content, verifies both HTTP status and the per-message `Status`, and persists only the returned Message UUID or ID.

Resend remains available without code changes. After AAGAM owns and verifies a sending domain, deployment can set `PARTNER_EMAIL_PROVIDER=RESEND` and provide the Resend API key and domain sender.

Neither provider API key, authorization header, OTP nor recipient address is written to provider-failure logs.

## Temporary email-only mode

`PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY` applies at every layer:

1. `/verification-capabilities` reports phone verification unavailable.
2. The mobile application hides the phone field and phone verification choice.
3. Application creation rejects phone-only or explicitly phone-selected requests before a draft is inserted.
4. Contact-code requests reject the phone channel before creating a challenge.
5. Firebase PNV challenge creation is rejected before creating a nonce.
6. Readiness marks Twilio and Firebase PNV inactive even when stale credentials remain in the environment.

Changing to `PNV_FIRST` re-enables the existing PNV-first and Twilio-fallback design without removing Mailjet email verification.

## HTTP contracts

- `GET /partner-onboarding/verification-capabilities`
- `POST /partner-onboarding/applications/:id/contact-code`
- `POST /partner-onboarding/applications/:id/verify-contact`
- `POST /partner-onboarding/applications/:id/phone-pnv/challenge`
- `POST /partner-onboarding/applications/:id/phone-pnv/verify`
- `GET /ready/verification`

Application endpoints require `Authorization: Application <access-token>`. Access is checked before Firebase token parsing so a valid PNV token cannot be used against another application.

## Firebase PNV sequence for future activation

1. AAGAM creates a short-lived single-use nonce, stores only its SHA-256 hash and returns the raw nonce to the authorized application session.
2. The Kotlin React Native bridge calls Firebase PNV `getDigitalCredentialPayload(nonce)`.
3. Android Credential Manager obtains user consent using a Digital Credential request containing the same nonce.
4. The bridge extracts the Firebase credential response and calls `exchangeCredentialResponseForPhoneNumber()`.
5. The app sends only the signed Firebase PNV token to AAGAM.
6. Firebase Admin verifies the token signature and Firebase contract. AAGAM independently enforces issuer, audience, expiry, nonce ownership, unused `jti`, application-session ownership and exact phone equality.
7. `phoneVerifiedAt` is written only after every check passes.

## Diagnostics and privacy

Provider failures log only provider, HTTP status, sanitized provider error code, correlation ID, application ID and timestamp. Logs and events never contain OTPs, API keys, secrets, authorization headers, full contact values or PNV tokens.

`GET /ready/verification` exposes only provider names, active/configured booleans, selected email provider, phone mode, QA-mode status and the last successful persisted provider timestamp.

## QA safety

QA uses deterministic code `424242` unless `PARTNER_QA_VERIFICATION_CODE` overrides it. Code exposure is allowed only outside production when `NODE_ENV=test` or `PLAYWRIGHT_QA=true`. Production validation rejects `PLAYWRIGHT_QA` and `PARTNER_QA_VERIFICATION_CODE`.

The protected Mailjet workflow uses placeholder credentials for mocked regression tests. Real Mailjet credentials are read only during an explicitly requested manual provider-proof run and are never committed or uploaded in artifacts.

Firebase test-session IDs are accepted only at runtime by a `BuildConfig.DEBUG`-guarded native method. They are never embedded in source, resources, `BuildConfig` or APK assets.
