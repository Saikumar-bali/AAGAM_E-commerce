# CLI-AI Prompt — Customer Mobile Phase CM-0 + CM-1

Use this prompt exactly. Do not start catalog/cart/checkout changes until CM-0 and CM-1 are proven.

---

You are working in `Saikumar-bali/AAGAM_E-commerce`.

Goal: complete **Customer Mobile CM-0 baseline verification** and **CM-1 auth/onboarding reliability** for `apps/mobile-customer` only.

Important rules:

1. Do not push to `main`.
2. Create/use branch: `feature/customer-mobile-cm-0-cm-1-auth`.
3. Scope is only:
   - `apps/mobile-customer/**`
   - `packages/mobile-shared/**` only if shared auth/API fixes are required
   - docs proof files under `docs/qa/customer-mobile/**` and `docs/ai-runs/**`
4. Do not modify `apps/mobile-partners/**` unless a shared-package change requires import compatibility, and if so document it.
5. Do not fake proof. If a command fails, paste exact error and stop or fix it honestly.
6. Do not implement checkout/cart/catalog polish in this phase.

Read these first:

- `docs/mobile-customer/PHASE_PLAN_CUSTOMER_APP_END_TO_END.md`
- `apps/mobile-customer/package.json`
- `apps/mobile-customer/App.tsx`
- `apps/mobile-customer/src/navigation/RootNavigator.tsx`
- `apps/mobile-customer/src/screens/LoginScreen.tsx`
- `apps/mobile-customer/src/screens/SignUpScreen.tsx`
- `packages/mobile-shared/src/api/client.ts`
- `packages/mobile-shared/src/store/authStore.ts`

## CM-0 baseline verification

Run and document:

```bash
git status --short
git branch --show-current
npm install
npm run build:api
npx tsc --noEmit -p packages/mobile-shared/tsconfig.json
npx tsc --noEmit -p apps/mobile-customer/tsconfig.json
```

Then build Android debug APK:

Windows:

```powershell
cd apps/mobile-customer/android
.\gradlew.bat assembleDebug
```

Linux/macOS:

```bash
cd apps/mobile-customer/android
./gradlew assembleDebug
```

If TypeScript fails only due to known `@env` typings, fix it properly by adding a local declaration file instead of ignoring it.

## CM-1 required code changes

Implement customer auth/onboarding reliability:

1. Signup validation:
   - name required
   - valid email
   - password minimum 6 characters or stronger if backend requires
   - phone must be empty, 10 digits, or valid `+91...`
2. The current signup UI collects phone but the shared `signUp` call does not send phone. Fix this cleanly:
   - inspect backend `/auth/signup` DTO/service before changing payload
   - if backend accepts phone, pass it
   - if backend does not accept phone, keep phone local but do not claim it is stored; document backend gap
3. Add password show/hide toggle on Login and SignUp.
4. Improve error display so backend messages are clear.
5. Add loading/disabled states to prevent duplicate login/signup taps.
6. Verify Keychain restore:
   - login
   - close/restart app
   - user remains inside customer app if token is valid
7. Verify wrong role handling:
   - login with rider/store/admin credentials in customer app
   - app blocks and shows customer-only message
8. Logout must clear auth token. Decide whether to clear cart on logout; if implemented, document why.

## Required docs to create/update

Create:

- `docs/qa/customer-mobile/cm-0-cm-1-proof.md`
- `docs/ai-runs/2026-07-05_customer-mobile-cm-0-cm-1-auth.md`

The proof doc must include:

```md
# Customer Mobile CM-0 + CM-1 Proof

## Branch

## Commit SHA

## Commands run

## Command results

## Android build result

## Manual runtime checks
- Login screen screenshot: REQUIRED
- Signup validation screenshot: REQUIRED
- Successful customer login screenshot: REQUIRED
- Wrong-role blocked screenshot: REQUIRED
- Restart/session restore note: REQUIRED
- Logout result screenshot: REQUIRED

## Known issues

## Next phase recommendation
```

## Final response required from CLI-AI

Return only:

1. Branch name
2. Commit SHA
3. Changed files
4. Commands run and PASS/FAIL
5. Android APK path if build passed
6. Manual screenshots/logs requested from owner
7. Known issues
8. Whether CM-2 can start

Do not say “completed” unless proof exists.
