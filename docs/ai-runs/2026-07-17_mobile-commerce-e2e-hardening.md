# Mobile Commerce End-to-End Hardening — 2026-07-17

Branch: `fix/mobile-commerce-e2e-hardening-20260717`

## Scope

This run independently audited the customer web checkout, customer mobile app, combined Rider/Store partner app, push-notification delivery, Android Google Sign-In configuration, coupon visibility, rider foreground tracking, and proof of delivery.

The previous “production-ready” label was not accepted as proof. Source wiring, Android services, API contracts, lifecycle state, and CI configuration were checked directly.

## Root causes and fixes

| Reported problem | Root cause | Resolution | Proof contract |
|---|---|---|---|
| Menu flashes on every click | Each route remounted `DashboardLayout`, called `/auth/me`, and replaced the whole screen with a full-page loader. Cookie transport was already configured with `withCredentials`. | Added a shared in-memory session cache and deduplicated request; role redirects now use `replace`; the authenticated shell remains stable. | `DashboardLayout.tsx` contains `cachedSession`, `sessionRequest`, and mounted push manager. |
| Checkout subtotal becomes zero | Independent `useCart()` instances hydrated asynchronously after route navigation; checkout displayed only the server quote. | Cart reads synchronously, persists every mutation, synchronizes hook instances, and checkout falls back to local calculated invoice values until the server quote arrives. | Checkout uses `quote?.invoice.subtotal ?? totalPrice`. |
| Live location shows no movable map | Geolocation only populated coordinates and text fields. | Added an OpenStreetMap/Leaflet picker with tap-to-place and draggable pin, plus reverse geocoding after movement. | `CustomerLocationPicker` contains `MapContainer`, draggable marker, and `dragend`. |
| Internal offer explanation visible | Customer checkout included implementation-facing copy. | Removed the exact sentence from the customer experience. | Static contract asserts the sentence is absent. |
| Admin coupon not visible to customer | New coupons were saved as `DRAFT`; customer APIs correctly expose only active or scheduled coupons. | Coupon creation now publishes immediately, or schedules it when `startsAt` is future. Existing pause/archive and manual publish controls remain. | Controller tests cover ACTIVE, SCHEDULED, and explicit PAUSED state. |
| Web service-worker notifications absent | Firebase worker and manager existed, but the manager was never mounted in the authenticated shell. | Mounted the push manager and restored token/worker registration when permission was previously granted. | Shared shell mounts `PushNotificationManager`; worker contains background handler. |
| Mobile push notifications absent | Firebase packages existed but neither app registered its FCM token after authentication. | Customer and partner apps now request permission, register `FCM_MOBILE`, refresh tokens, handle foreground messages, and install the background handler before app registration. | Shared notification lifecycle and both app entry points are checked. |
| Rider sticky notification uncertain | Native foreground service existed, but Android notification permission was not reliably requested by the app. | Added Android 13+ notification permission flow while retaining `startForeground`, ongoing notification, and `START_STICKY`. | Contract verifies native foreground-service behavior. |
| Proof of delivery missing in partner UI | Backend already stored OTP-based `DeliveryProof`, but mobile sent an incomplete payload and did not expose a complete proof workflow. | Rider UI now requires OTP, explicit handoff confirmation, live GPS, accuracy, optional note, and displays recorded proof metadata. | Mobile API payload is `CUSTOMER_OTP_PIN` with `riderConfirmed`, GPS, and accuracy. |
| Store app marked complete despite placeholder | Store Settings tab was a literal “coming soon” screen. | Implemented assigned-store selection, profile edit, operational notification guidance, and secure sign-out. | Contract rejects placeholder copy and verifies update API wiring. |
| Google Sign-In APK failures | Partner workflow mutated `google-services.json`; fallback builds could use an ephemeral debug certificate whose SHA was never registered. | Both APK jobs now derive SHA-1/SHA-256 from the exact signing key, validate package + Android OAuth client + web client + Firebase JSON, require a pinned debug key when release signing is absent, and upload proof artifacts. | Workflow rejects `keytool -genkey` and JSON SHA mutation. |

## Mobile completeness audit

### Customer mobile

Implemented and wired in this run:

- Authenticated FCM lifecycle and token refresh
- Foreground toast notifications and background handler
- Android notification permission
- Existing secure bearer-token storage remains in Keychain

Still requires real-device acceptance after CI APK generation:

- Google account chooser and successful backend session using the CI-produced signing SHA
- Notification receipt from Firebase on a physical Android device
- Manufacturer-specific battery optimization behavior

### Rider partner role

Implemented and wired:

- Native foreground location service with sticky ongoing notification
- Android notification permission
- FCM registration
- OTP/COD/failure/return workflows
- Auditable OTP + GPS proof of delivery

Not represented as complete enterprise POD features:

- Delivery photo upload
- Customer signature capture
- ID-document capture

Those need a deliberate media-storage, consent, retention, and privacy contract. OTP + rider confirmation + timestamp + GPS is now a valid auditable POD method and no longer a missing workflow.

### Store partner role

Implemented and wired:

- Dashboard, order queue, delivery-operation handoffs
- FCM registration
- Store profile settings and sign-out

Remaining product-depth work found by the audit:

- Product and inventory editing inside the native Store app is not yet a dedicated tab
- Store operating hours, holiday overrides, printer/device settings, and staff management are not yet native settings
- Real-device push acceptance remains required

The Store app is therefore materially functional, but it should not yet be described as feature-complete against Blinkit/Zomato-style store operations.

## Google credentials contract

The CI proof artifact is the source of truth for the certificate fingerprints.

Required configuration:

- Web OAuth client ID: `GOOGLE_WEB_CLIENT_ID` repository variable or secret
- Customer Android OAuth client: package `com.aagamcustomer`, client ID in `GOOGLE_ANDROID_CLIENT_ID_CUSTOMER`
- Partner Android OAuth client: package `com.aagampartners`, client ID in `GOOGLE_ANDROID_CLIENT_ID_PARTNERS`
- Fresh Firebase JSON after OAuth/package/SHA configuration:
  - `GOOGLE_SERVICES_JSON_CUSTOMER`
  - `GOOGLE_SERVICES_JSON_PARTNERS`
- Signing:
  - all four release-keystore secrets, or
  - pinned `DEBUG_KEYSTORE_BASE64`

CI refuses an ephemeral signing key because such an APK cannot have reliable Google Sign-In.

## Required evidence before merge

1. CI Build passes.
2. API Service Tests pass, including coupon publishing and hardening contracts.
3. Playwright smoke tests pass.
4. Customer Android APK job passes strict Google validation and uploads APK + proof artifact.
5. Partner Android APK job passes strict Google validation and uploads APK + proof artifact.
6. Physical-device acceptance records:
   - Customer Google Sign-In
   - Partner Google Sign-In
   - Customer notification receipt
   - Store new-order notification receipt
   - Rider sticky notification during active delivery
   - Rider POD submission and customer/admin proof visibility

## Commit grouping

Each task was pushed as a solved unit rather than one commit per edited file:

1. Stable authenticated shell, cart persistence, web push restoration
2. Checkout totals and draggable delivery map
3. Mobile push lifecycle, Store Settings, rider POD
4. Android Google OAuth/signing validation
5. Coupon publishing lifecycle
6. Automated hardening proof contracts and this audit
