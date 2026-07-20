# AI run — Customer first-phone OTP and unified toasts

## Scope

Repository: `Saikumar-bali/AAGAM_E-commerce`
Base: `main` at `ca8e7568f251cd8e4eac77938f416036674de7f5`
Target branch: `fix/customer-first-phone-otp-toasts`

Only the AAGAM Customer React Native app, directly related authentication contracts, the existing customer-mobile workflow, and proof documentation are in scope.

## Verified defect

`LoginScreen.tsx` used English message matching to detect an unknown Customer phone. The API contract is HTTP 404, and `mobileAuthError` already retains that status. Because the response text differed from the phrase being searched, a first-time customer saw an error instead of automatically receiving a signup OTP.

## Implementation

- Extracted deterministic LOGIN-first OTP purpose discovery.
- Added 404-only signup fallback and a one-time LOGIN retry for the 409 account-creation race.
- Stored the resolved OTP purpose in screen state.
- Made resend purpose-direct.
- Added independent request and verification locks.
- Reset all challenge state and locks when changing the mobile number.
- Added full-name and optional-email validation to the same login flow.
- Centralized Customer notifications and safe error extraction.
- Added custom safe-area toast rendering and migrated passive Customer feedback.
- Retained only decision-required destructive confirmation dialogs.
- Added deterministic mobile tests and API authentication contracts.
- Extended the existing Customer Mobile CM0 workflow and added APK artifact upload.

## Verification recorded before push

```text
Customer OTP and notification contracts: 15 passed, 0 failed
```

Static audits are run against the staged patch before publication. Full `npm ci`, TypeScript, API CI, commerce tests, Android compilation, and APK publication run in GitHub Actions because this execution environment cannot clone the repository or reach package hosts.

## Known limitation

Android emulator/device screenshots could not be produced in this runtime. The PR must remain unmerged until a real device or emulator validates first-time signup, returning-customer login, wrong/invalid OTP, resend purpose behavior, invalid phone feedback, and at least one non-authentication success and API-error toast.
