# Mailjet Partner Email Verification

## Purpose

Mailjet is the temporary production email-OTP provider for Rider and Store partner onboarding. Phone verification is disabled with `EMAIL_ONLY` until a supported phone-verification path is available. Resend remains implemented for future use with an AAGAM-owned domain.

## Mailjet account requirement

The value used for `PARTNER_VERIFICATION_FROM_EMAIL` must exactly match a sender address validated in the Mailjet account. The API key and secret must belong to the same Mailjet account.

## GitHub configuration

Repository **Secrets and variables → Actions**:

### Secrets

```text
MAILJET_API_KEY
MAILJET_SECRET_KEY
MAILJET_TEST_TO_EMAIL
```

`MAILJET_TEST_TO_EMAIL` is required only for a manually requested sandbox/live provider proof. Keeping it as a secret avoids publishing a personal test address in workflow logs or repository configuration.

### Variables

```text
PARTNER_EMAIL_PROVIDER=MAILJET
PARTNER_VERIFICATION_FROM_EMAIL=<exact validated Mailjet sender>
PARTNER_VERIFICATION_FROM_NAME=AAGAM Verification
PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY
```

Do not put the API key or secret in repository variables, workflow YAML, source files, mobile resources, Android `BuildConfig`, screenshots or issue comments.

## VPS configuration

Add to the API process environment, for example the backend `.env` loaded by PM2:

```env
NODE_ENV=production
PARTNER_EMAIL_PROVIDER=MAILJET
MAILJET_API_KEY=replace-on-server
MAILJET_SECRET_KEY=replace-on-server
PARTNER_VERIFICATION_FROM_EMAIL=validated-sender@example.com
PARTNER_VERIFICATION_FROM_NAME=AAGAM Verification
PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY
```

Restart the API after changing environment values:

```bash
pm2 restart <api-process-name> --update-env
pm2 logs <api-process-name> --lines 100
```

Run production validation before restarting when possible:

```bash
node scripts/validate-prod-env.js
```

## Local configuration

For a real local Mailjet delivery test, use an uncommitted `.env`:

```env
NODE_ENV=development
PARTNER_EMAIL_PROVIDER=MAILJET
MAILJET_API_KEY=replace-locally
MAILJET_SECRET_KEY=replace-locally
PARTNER_VERIFICATION_FROM_EMAIL=validated-sender@example.com
PARTNER_VERIFICATION_FROM_NAME=AAGAM Verification
PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY
```

Never add the local `.env` to Git.

For deterministic application-flow testing without contacting Mailjet:

```env
NODE_ENV=development
PLAYWRIGHT_QA=true
PARTNER_QA_VERIFICATION_CODE=424242
PARTNER_PHONE_VERIFICATION_MODE=EMAIL_ONLY
```

QA variables must never be present in production.

## Automated proof

The `Mailjet Partner Email Verification` workflow runs automatically on the feature branch and pull request. Automatic runs:

- install dependencies;
- generate and validate Prisma;
- migrate a new PostgreSQL database;
- prove the database provider enum includes `MAILJET`;
- build the backend;
- type-check the partner mobile app;
- run backend and mobile tests;
- validate a Mailjet email-only production environment;
- prove production rejects QA flags;
- record that real provider testing was not run.

## Protected provider proof

Open **Actions → Mailjet Partner Email Verification → Run workflow** and choose:

- `sandbox`: validates protected credentials and the Mailjet request without intentionally delivering an email;
- `live`: sends one non-OTP integration-test email to `MAILJET_TEST_TO_EMAIL`;
- `skip`: does not contact Mailjet.

The script prints only provider, mode, HTTP status, Mailjet message status, message ID, correlation ID and timestamp. It does not print credentials, authorization headers or OTPs.

## Recorded live provider proof

A repository-owner local live proof was accepted by Mailjet on 2026-07-18:

```text
provider=MAILJET
mode=live
httpStatus=200
messageStatus=success
messageId=c3b5eabf-1771-43c8-a815-c719ce4bc40c
correlationId=aagam-mailjet-proof-1784396205325
timestamp=2026-07-18T17:36:47.322Z
```

This proves that Mailjet accepted the authenticated request for the configured sender. Recipient inbox arrival must still be confirmed separately before production merge.

## Application behavior

With `EMAIL_ONLY`:

- the mobile app offers Email only;
- phone-only application creation is rejected before database insertion;
- the backend rejects SMS OTP and Firebase PNV requests;
- a six-digit code is generated server-side;
- Mailjet receives the email request;
- the challenge becomes `SENT` only after Mailjet accepts it;
- entering the valid code marks `emailVerifiedAt`;
- production responses never return the OTP.

## Switching to Resend later

After purchasing and verifying an AAGAM-owned domain:

```env
PARTNER_EMAIL_PROVIDER=RESEND
RESEND_API_KEY=replace-on-server
PARTNER_VERIFICATION_FROM_EMAIL=AAGAM Verification <verify@owned-domain.example>
```

Mailjet credentials may remain during a controlled transition, but readiness reports only the selected provider as active. Remove unused credentials after the transition is confirmed.

## Troubleshooting

### `MAILJET_UNCONFIGURED`

One of the API key, secret, sender or recipient is missing.

### `MAILJET_INVALID_FROM`

`PARTNER_VERIFICATION_FROM_EMAIL` is not a valid plain email or `Name <email>` value.

### Mailjet rejects the sender

Confirm the sender is validated in the same Mailjet account as the API key. The spelling and address must match exactly.

### API accepted but email is absent

Check the recipient spam/junk folder and Mailjet message activity. API acceptance proves Mailjet accepted the request, not that every recipient mailbox placed it in the inbox.

### App still shows Phone

Confirm the deployed API returns:

```json
{
  "mode": "EMAIL_ONLY",
  "phone": { "available": false }
}
```

Then rebuild/restart the mobile app and verify it points to the updated API URL.
