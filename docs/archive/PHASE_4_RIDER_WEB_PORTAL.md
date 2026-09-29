# Phase 4 — Rider Web Portal

## Outcome

Phase 4 turns the existing Rider web surface into a complete operational portal backed by canonical delivery jobs, Phase 3 handoff controls, real notification records, real earning records, and auditable Rider operations.

No page calculates Rider income from a customer order total. No rating is invented. A payout engine remains outside this phase; the portal only exposes earning and COD records that exist in the database.

## Web routes

- `/rider` — home, availability, active work, today’s completion count, operational alerts
- `/rider/offers` — directly addressed offers, expiry countdown, accept/reject reason
- `/rider/delivery` — canonical timeline, navigation, contact, OTP, COD, completion, failure, return
- `/rider/pickup` — item quantities, parcel state, pickup verification, problem reporting
- `/rider/notifications` — Rider inbox, unread badge, foreground/background push, deep links
- `/rider/history` — terminal jobs, outcome/date filters, real timestamps and audit
- `/rider/earnings` — persisted fee/incentive/bonus/penalty rows, daily/weekly/pending/paid totals
- `/rider/cod` — cash held, collected, settled, pending handovers, references and audit
- `/rider/performance` — real assignment and job metrics
- `/rider/availability` — status, shifts, schedule and breaks
- `/rider/profile` — personal, vehicle, emergency, documents and protected bank data
- `/rider/support` — delivery-linked tickets, evidence, status and conversation history

## Security and integrity

- Every portal API is guarded by JWT authentication and the `RIDER` role.
- Offers are filtered by `riderProfileId`; expired offers are updated before reads.
- Acceptance still uses the Phase 0–3 serializable assignment service and its one-active-job gate.
- OTP, COD, failure, return, and completion continue through Phase 3 `DeliveryOperationsService` endpoints.
- Bank account and IFSC values are AES-256-GCM encrypted using `RIDER_BANK_ENCRYPTION_KEY`; only masked account digits leave the API.
- Licence, identity, and support evidence is uploaded to the separate private `R2_EVIDENCE_BUCKET_NAME` bucket. The database stores opaque object keys; access uses short-lived signed URLs.
- Pickup quantity verification requires every submitted item quantity to equal the canonical order quantity.
- Support tickets and messages are scoped to the authenticated Rider profile.
- Admin-only APIs create shifts and real earning records, mark an earning paid, review documents/profile/bank status, and manage support conversations. They do not calculate earnings from an order total or perform settlement payouts.

## Data model

Migration `20260712190000_phase_4_rider_portal` adds Rider availability, shifts, breaks, documents, earnings, pickup tasks, support tickets/messages, vehicle/emergency fields, approval states, and encrypted bank storage.

## Validation

Run:

```bash
npx prisma validate --schema packages/database/prisma/schema.prisma
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run test:phase4
npm run build:api
npm run build:admin
```

Local proof must use an isolated database and the exact Phase 4 commit. Do not upload OTP values, cookies, bearer tokens, bank values, private document numbers, or encryption secrets.
