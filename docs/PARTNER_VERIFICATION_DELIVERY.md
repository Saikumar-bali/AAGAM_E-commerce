# Partner Verification Delivery

Partner application contact codes are delivered by the API before they are recorded as sent.

## Email

Provider: Resend

Required production secrets:

- `RESEND_API_KEY`
- `PARTNER_VERIFICATION_FROM_EMAIL`

The sender must be a domain/address verified in Resend.

## Phone

Provider: Twilio Programmable Messaging

Required production secrets:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_PHONE`

The Twilio sender must be able to send to the applicant country. Trial accounts may require verified recipients.

## Failure behavior

- Missing provider configuration returns `503 Service Unavailable`.
- Provider rejection returns `503 Service Unavailable`.
- A `CONTACT_CODE_SENT` event is written only after the provider accepts delivery.
- Resending does not replace the currently stored code until the new provider delivery is accepted.
- Codes and provider credentials are never written to logs or lifecycle metadata.

## Automated tests

When `NODE_ENV=test` or `PLAYWRIGHT_QA=true`, external delivery is suppressed and the code is returned only to the automated test client. Production never returns the code in the API response.
