# Aagam Current Task Queue

## How To Use
5.3 Codex should implement only the first unchecked task in this file, then update this file and `docs/AAGAM_IMPLEMENTATION_LOG.md`.

## Active Phase
Phase 2/3 bridge: customer address reliability, rider live tracking, order tracking, and ETA readiness.

## Current Task Queue

- [x] Verify latest mobile release APK after rider login.

Latest verification status (2026-05-22):
- `.\gradlew.bat assembleRelease` passed in `apps/mobile-app/android`.
- Release APK installed successfully on device `192.168.0.22:41039` (`com.aagammobile`).
- App launch smoke test ran (`adb shell monkey -p com.aagammobile -c android.intent.category.LAUNCHER 1`).
- `adb logcat -d *:E` captured after launch; no rider-login crash stack trace captured yet.
- Remaining manual checks: customer login, rider login flow, location permission prompt, and auto-online status after GPS success.

Crash verification update (2026-05-22 18:51-18:52 IST):
- Crash reproduced right after allowing location permission ("While using the app") during rider login flow.
- Exact error from `adb logcat`:
  - `java.lang.IncompatibleClassChangeError: Found interface com.google.android.gms.location.FusedLocationProviderClient, but class was expected`
  - `at com.agontuk.RNFusedLocation.FusedLocationProvider.getCurrentLocation(FusedLocationProvider.java:97)`
  - `at com.agontuk.RNFusedLocation.RNFusedLocationModule.getCurrentPosition(RNFusedLocationModule.java:112)`
- This indicates a runtime incompatibility in fused-location library usage/versioning, not a transient permission denial.

Retest after fix (2026-05-23):
- Applied Android dependency alignment for location services in `apps/mobile-app/android/app/build.gradle`:
  - `implementation("com.google.android.gms:play-services-location:21.0.1")`
- Fresh release APK built and installed successfully.
- Rider login + location permission ("While using the app") was re-tested during live `adb logcat` monitoring.
- No `FATAL EXCEPTION`, `AndroidRuntime`, `IncompatibleClassChangeError`, or `RNFusedLocation` crash logs were observed during the 2-minute verification window.

Extended retest (2026-05-23 12:16 IST):
- Fresh release APK installed after rebuild.
- Rider login + location permission flow re-tested with 4-minute focused live log capture.
- Post-capture grep scan also ran on full log buffer.
- No `FATAL EXCEPTION`, `AndroidRuntime`, `IncompatibleClassChangeError`, or `RNFusedLocation` entries were found.

Acceptance criteria:
- Release APK installs cleanly.
- Customer login works.
- Rider login does not crash.
- Rider location permission prompt appears.
- Rider becomes online automatically after permission and GPS success.
- If crash happens, capture `adb logcat` and document the exact stack trace.

Likely files:
- `apps/mobile-app/src/screens/rider/RiderDashboard.tsx`
- `apps/mobile-app/src/utils/notifications.ts`
- `apps/mobile-app/src/api/riderService.ts`
- `apps/mobile-app/android/app/src/main/AndroidManifest.xml`

Verification:
- `cd apps/mobile-app/android`
- `.\gradlew.bat assembleRelease`
- Install APK on device.
- `adb logcat *:E`

Deployment:
- Push to GitHub only after local or GitHub APK build passes.

- [ ] Execute production order tracking test step by step.

Step-by-step execution notes:
- Step 1 (Customer address setup): PASSED on production with saved address coordinates visible (`Lat 17.748584`, `Lng 83.258268`).
- Step 2 (Customer order placement): BLOCKED on first attempt.
  - Screen: `/shop/checkout`
  - Error shown: `Out of stock: Eggs (12 pack)`
  - Repro: add Eggs + another item, proceed to checkout, attempt COD place order.
  - Impact: order cannot be placed with current cart contents until inventory is adjusted or out-of-stock item is removed.
- Follow-up fix implemented:
  - Added admin product inventory controls per store (`Stock Qty` + `Save`) and deployed web on Railway.
  - Order creation is now possible after inventory update.
- Rider queue reliability fix implemented (mobile):
  - Socket fallback base URL switched to production-safe API URL.
  - Added periodic refetch for rider assigned and queue endpoints while rider is online.
  - Added in-app new-order alert fallback when queue receives new order IDs even if push/socket toast is missed.
  - Added clearer "Available Orders" UI with live count and inline refresh action.
- Closed-app push notification diagnostics (production):
  - Device log capture during fresh order placement showed no rider-app FCM delivery callback.
  - Railway API logs confirmed root cause:
    - `[NotificationService] Firebase Admin not initialized (missing FIREBASE_SERVICE_ACCOUNT_JSON and firebase-adminsdk.json).`
    - `[NotificationService] Firebase not initialized. Skipping push notification.`
  - Meaning: queue/socket fallback works, but true closed-app FCM alerts are blocked until Firebase service account env is configured on `aagam-api`.
- Rider/admin delivery professionalism patch (2026-05-23 evening):
  - Rider app now reads delivery address from `addressSnapshot` (instead of missing `customerAddress`), shows customer phone fallback, adds `Navigate to customer` route action, and adds `Call customer` action.
  - Admin orders API payload now includes customer phone and store address/coordinates in `/orders`.
  - Admin orders detail modal now shows delivery address snapshot, destination coordinates, `Open Route` map action, and `Call customer` action.
  - Targeted builds passed: `npm run build:api`, `npm run build:admin`, `npx tsc --noEmit -p apps/mobile-app/tsconfig.json`.

Acceptance criteria:
- Customer places order in production.
- Rider sees/accepts order in production APK.
- Admin sees rider/order status.
- Customer order detail shows status and tracking-ready data.
- Any failure is logged with endpoint, screen, and reproduction.

Reference:
- `docs/PRODUCTION_ORDER_TRACKING_TEST_PLAN.md`

- [ ] Add server-side ETA calculation.

Acceptance criteria:
- Tracking response includes estimated distance and ETA minutes when rider/store/customer coordinates are available.
- ETA is safe when coordinates are missing.
- Customer order detail can display ETA without crashing.

Likely files:
- `apps/api-gateway/src/orders/order.service.ts`
- `apps/api-gateway/src/tracking/*`
- `apps/admin-dashboard/src/app/(shop)/shop/orders/[id]/page.tsx`
- `apps/mobile-app/src/screens/customer/OrderDetailScreen.tsx`

- [ ] Add customer-facing map visualization for live delivery.

Acceptance criteria:
- Web customer order detail shows map when latest rider location exists.
- Mobile customer order detail shows location coordinates or map fallback.
- Empty state is clear before rider assignment.

- [ ] Add foreground rider tracking reliability plan and implementation.

Acceptance criteria:
- Rider tracking continues during active delivery more reliably.
- Battery/network limitations are documented.
- Background location behavior is explicitly handled or deferred with a clear reason.

## Recently Completed
- [x] Verified release APK install and fixed rider login location-permission crash (`IncompatibleClassChangeError`).
- [x] Product cards render two per row on web and mobile.
- [x] Web customer addresses support live location, search, map click, and draggable marker.
- [x] Mobile customer addresses support current location and map pinning.
- [x] Rider app attempts automatic online status after location permission.
- [x] Added `PATCH /riders/me/status` for rider self-status.
- [x] Added production order tracking test plan.
