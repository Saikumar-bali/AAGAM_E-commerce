# Customer Mobile CM-0 Test Scenarios

Scope: baseline verification for `apps/mobile-customer` before CM-1 feature work.

## TC-CM0-01 Repository hygiene

Steps:
1. Checkout the CM-0 branch.
2. Run `git status --short`.
3. Confirm the branch is not `main`.

Expected:
- Working tree is clean before testing.
- Branch name is `feature/customer-mobile-cm0-baseline`.

## TC-CM0-02 Dependency install

Steps:
1. From repo root, run `npm install` or `npm ci`.

Expected:
- Dependencies install without lockfile or workspace errors.

## TC-CM0-03 API build baseline

Steps:
1. From repo root, run `npm run build:api`.

Expected:
- API and shared package build completes successfully.

## TC-CM0-04 Shared mobile TypeScript baseline

Steps:
1. Run `npx tsc --noEmit -p packages/mobile-shared/tsconfig.json`.

Expected:
- Shared mobile package typecheck passes.

## TC-CM0-05 Customer mobile TypeScript baseline

Steps:
1. Run `npx tsc --noEmit -p apps/mobile-customer/tsconfig.json`.

Expected:
- Customer mobile app typecheck passes.
- Mobile config imports do not fail TypeScript.

## TC-CM0-06 Android debug build

Steps:
1. On Windows:
   - `cd apps/mobile-customer/android`
   - `.\gradlew.bat assembleDebug`
2. On Linux or macOS:
   - `cd apps/mobile-customer/android`
   - `./gradlew assembleDebug`

Expected:
- Debug APK builds successfully.
- APK path is `apps/mobile-customer/android/app/build/outputs/apk/debug/app-debug.apk`.

## TC-CM0-07 Fresh launch smoke test

Steps:
1. Install debug APK on emulator or Android device.
2. Launch the app.
3. Capture login screen screenshot.

Expected:
- App opens without native crash.
- Login screen appears.

## TC-CM0-08 Navigation smoke test

Steps:
1. From Login, tap Register now.
2. Tap back from Signup.

Expected:
- Signup screen opens.
- Back returns to Login.
- No crash.

## TC-CM0-09 Customer login smoke test

Steps:
1. Login with a valid customer test account.
2. Open Shop, Cart, Orders, and Profile tabs.

Expected:
- Customer tabs render.
- Shop either loads products or shows a clear API error state.
- Profile either loads addresses or shows empty state.

## TC-CM0-10 Wrong role smoke test

Steps:
1. Logout.
2. Login using a non-customer test account.

Expected:
- App blocks access with customer-only message.
- Partner/admin/rider user does not enter customer tabs.

## Evidence required before CM-1

- Command output for TC-CM0-02 through TC-CM0-06.
- Screenshot for Login.
- Screenshot for Signup.
- Screenshot after valid customer login.
- Screenshot for wrong-role blocked screen.
- Any crash must include `adb logcat` error lines.
