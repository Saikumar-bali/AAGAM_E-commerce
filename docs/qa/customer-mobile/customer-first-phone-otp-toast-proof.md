# Customer first-phone OTP and toast proof

Date: 2026-07-20
Branch: `fix/customer-first-phone-otp-toasts`
Base main SHA: `ca8e7568f251cd8e4eac77938f416036674de7f5`

## Root cause

The Customer login screen decided whether to start signup by searching the English error message for `not found`. The API correctly returned HTTP 404 with the message `No Customer account uses this phone number`, while the shared mobile authentication wrapper already exposed the normalized HTTP status as `error.status`. The control flow therefore depended on unstable copy instead of the stable status contract.

## Architecture

- `customerPhoneOtpFlow.ts` owns purpose discovery and contains no React or networking implementation details.
- The flow always requests `LOGIN` first and falls back to `SIGNUP` only for HTTP 404.
- A `SIGNUP` 409 is treated as an account-creation race and retries `LOGIN` exactly once.
- Resend receives the already resolved purpose and never repeats account discovery.
- Independent request and verification locks prevent repeated taps and auto/manual OTP verification races.
- `notify.ts` is the single customer-app notification boundary.
- `notifyCore.ts` converts API, validation, network, timeout, and rate-limit failures into safe readable messages.
- `CustomerToast.tsx` provides safe-area-aware AAGAM success, error, information, and warning cards.
- Destructive address deletion and sign-out keep native confirmation dialogs because they require an explicit decision. Passive feedback uses toast.

## Request and verification sequence

### Existing customer

1. `POST /auth/phone/request` with `purpose: LOGIN`.
2. Store `otpPurpose: LOGIN` and the returned masked destination.
3. `POST /auth/mobile/phone/verify` with `purpose: LOGIN`.
4. Persist the returned bearer session through the existing Keychain implementation.
5. Enter the authenticated Customer app.

### First-time customer

1. `POST /auth/phone/request` with `purpose: LOGIN` returns 404.
2. Automatically call the same endpoint with `purpose: SIGNUP`.
3. Store `otpPurpose: SIGNUP`, show the profile fields, and validate the required trimmed name and optional email.
4. `POST /auth/mobile/phone/verify` with the signup profile.
5. The API creates a `CUSTOMER`, returns the mobile bearer session, and the existing Keychain implementation persists it.
6. Enter the authenticated Customer app.

## Toast rules

- Success: approximately 2.5 seconds.
- Information and warning: approximately 3 seconds.
- Error: approximately 4 seconds.
- All variants use top placement, safe-area clearance, wrapped text, strong contrast, automatic hiding, and phone-friendly maximum width.
- Screens and user-action handlers own feedback; the Axios client and auth store do not emit automatic toasts.
- Backend objects, stack traces, Axios internals, Prisma/SQL details, bearer tokens, and secrets are filtered from user-visible messages.

## Changed files

### OTP flow

- `apps/mobile-customer/src/auth/customerPhoneOtpFlow.ts`
- `apps/mobile-customer/src/screens/LoginScreen.tsx`
- `apps/mobile-customer/src/screens/SignUpScreen.tsx`

### Toast system

- `apps/mobile-customer/src/ui/notifyCore.ts`
- `apps/mobile-customer/src/ui/notify.ts`
- `apps/mobile-customer/src/ui/CustomerToast.tsx`
- `apps/mobile-customer/App.tsx`
- `apps/mobile-customer/src/screens/customer/CustomerProfileScreen.tsx`
- `apps/mobile-customer/src/screens/customer/CheckoutScreen.tsx`
- `apps/mobile-customer/src/screens/customer/ReviewScreen.tsx`

### Tests and CI

- `apps/mobile-customer/src/auth/customerPhoneOtpFlow.test.mjs`
- `apps/mobile-customer/src/ui/notifyCore.test.mjs`
- `apps/api-gateway/src/auth/customer-phone-auth.contract.spec.ts`
- `.github/workflows/customer-mobile-cm0.yml`

## Deterministic proof

Locally runnable pure contract command:

```bash
node --experimental-strip-types --test \
  apps/mobile-customer/src/auth/customerPhoneOtpFlow.test.mjs \
  apps/mobile-customer/src/ui/notifyCore.test.mjs
```

Result in the implementation runtime: **15 passed, 0 failed**.

The API contract suite covers unknown LOGIN, unknown SIGNUP challenge creation, signup verification and CUSTOMER creation, mobile bearer-session response, subsequent LOGIN eligibility, invalid/expired OTP non-creation, and duplicate-email rejection.

## Android APK

Expected CI path:

```text
apps/mobile-customer/android/app/build/outputs/apk/debug/app-debug.apk
```

Artifact name:

```text
aagam-customer-debug-apk
```

Retention: 7 days.

## Device and CI evidence

GitHub Actions is the authoritative environment for dependency installation, API contracts, TypeScript checks, commerce contracts, and the Android debug build. The PR Checks page and artifact panel contain the post-push run and APK links.

The current execution environment could not clone `github.com` or start an Android emulator because outbound DNS/network access was unavailable. No device screenshots, OTP values, phone numbers, tokens, or secrets were fabricated or committed. Device/emulator proof remains required before this work can be called fully accepted.

## Security confirmation

- No production OTP bypass or hard-coded OTP was added.
- The mobile bearer-token and Keychain model was not changed.
- Browser HttpOnly-cookie authentication was not changed.
- Partner and Google authentication contracts were not changed.
- No secret, token, keystore, environment file, or private phone number is included.
