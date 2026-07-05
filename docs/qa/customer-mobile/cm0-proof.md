# Customer Mobile CM-0 Proof

Date: 2026-07-05
Branch: `feature/customer-mobile-cm0-baseline`
Status: Branch prepared with repeatable baseline checks.

## Completed in branch

- Added customer mobile TypeScript coverage for the mobile config import module.
- Added shared mobile TypeScript coverage for the mobile config import module.
- Updated TypeScript configs to avoid the earlier conflicting loose declaration file during baseline checks.
- Added GitHub Actions workflow: `.github/workflows/customer-mobile-cm0.yml`.
- Added CM-0 test scenarios: `docs/qa/customer-mobile/cm0-test-scenarios.md`.

## Automated proof

Workflow: `Customer Mobile CM0`

Required checks:

- dependency install
- API build
- shared mobile typecheck
- customer mobile typecheck
- Android debug build

## Local proof required

Run these from repo root unless a step says otherwise:

```bash
npm install
npm run build:api
npx tsc --noEmit -p packages/mobile-shared/tsconfig.json
npx tsc --noEmit -p apps/mobile-customer/tsconfig.json
```

Windows Android build:

```powershell
cd apps/mobile-customer/android
.\gradlew.bat assembleDebug
```

Expected debug APK:

`apps/mobile-customer/android/app/build/outputs/apk/debug/app-debug.apk`

## Screenshots required

- Login screen.
- Signup screen.
- Customer login success screen.
- Wrong-role blocked screen.

## Acceptance

CM-0 is accepted only when automated checks pass or the exact failing step is documented, local Android debug APK builds, app launches without crash, signup navigation opens, customer login reaches tabs, and wrong-role login is blocked.

## Next phase

CM-1: auth and onboarding reliability.
