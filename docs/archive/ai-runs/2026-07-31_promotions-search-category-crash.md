# CLI-AI Run Contract — Promotions, Search, and Category Crash

Repository: `Saikumar-bali/AAGAM_E-commerce`

Branch: `agent/fix-promotions-search-category-crash`

## Required action

Run the proof commands in
`docs/qa/promotions-search-category-crash-proof.md` against this branch. Do not
merge to `main` until the automated checks and Android interaction proof pass.

## Acceptance criteria

- Admin creation with the default status publishes a customer-visible campaign
  when a customer placement and valid schedule are selected.
- An explicit Draft remains hidden from the customer feed.
- Mobile search is debounced at 350 ms and uses the normalized query.
- Mobile category → All remounts the list safely and does not crash.
- The release APK launches and has no new fatal exception in logcat.
- No secret, OTP, token, cookie, or unredacted customer credential is present
  in committed proof.

## Return only this summary

```text
Branch:
Commit:

Automated:
- Prisma validate:
- API tests:
- Customer mobile typecheck:
- Customer mobile tests:
- Playwright promotion test:
- git diff --check:

Android:
- Release APK build:
- Install/launch:
- Promotion visible:
- Search request behavior:
- Category -> All:
- Fatal exception block:

Artifacts:
- APK path:
- Screenshot paths:
- Playwright report path:

Remaining blocker:
```
