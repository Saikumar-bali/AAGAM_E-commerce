# Phase 2B — Mobile Delivery Scenario Testing

Branch: `phase-2b-mobile-consolidation-delivery`

This runbook is the acceptance record for the consolidated AAGAM mobile architecture:

- `apps/mobile-customer` — customers only
- `apps/mobile-partners` — rider, store owner, and limited admin by authenticated role
- `packages/mobile-shared` — shared auth, API, push, and reusable mobile utilities
- `apps/mobile-app` — removed and must remain absent

## Required actors

Use five isolated accounts:

| Actor | Required role | Purpose |
|---|---|---|
| Admin | `ADMIN` | Creates/observes dispatch offers |
| Store | `STORE_OWNER` | Prepares order and verifies pickup |
| Customer | `CUSTOMER` | Places order and watches live tracking |
| Rider A | `RIDER` | Intended offer recipient |
| Rider B | `RIDER` | Isolation and authorization proof |

Use two Android devices or one physical device plus one emulator for Rider A/Rider B isolation. Background-location and notification-tray proof must use a physical Android device.

## Automated gate

Run from repository root:

```bash
npm install
npx prisma generate --schema packages/database/prisma/schema.prisma
npm run test:phase2b --workspace=apps/api-gateway
npm run test:phase2b --workspace=AagamPartners
npm test
npx turbo build --force
npm run build:partners
cd apps/mobile-partners/android
./gradlew assembleDebug --no-daemon --stacktrace
```

Required automated proof:

- Phase 2B API integration suite passes.
- Rider workspace domain tests pass.
- Tracking manager tests pass.
- Full API regression suite passes.
- Web/API/shared/Partners TypeScript builds pass.
- Android debug APK is produced.
- CI grep gate finds none of:
  - `/orders/rider/queue`
  - `/orders/assign`
  - `joinRidersQueue`
  - `joinRiderZone`
  - `newOrderNearby`
- `apps/mobile-app` does not exist.

## Scenario A — Role-based application boundary

### Steps

1. Sign in to AAGAM Customer with a customer account.
2. Confirm shopping/customer navigation loads.
3. Attempt customer login in AAGAM Partners.
4. Confirm the Partners-only blocked screen appears.
5. Sign in to Partners as Rider A, Store Owner, and Admin separately.
6. Confirm each receives only its role navigator.

### Expected

- Customers cannot enter partner operations.
- Rider receives Rider tabs.
- Store Owner receives Store tabs.
- Admin receives limited mobile admin home.
- No separate rider APK is required.

### Evidence

- Screenshot: customer app home.
- Screenshot: customer blocked in Partners.
- Screenshot: Rider/Store/Admin role landing pages.

## Scenario B — Addressed offer isolation

### Setup

1. Customer places an order.
2. Store accepts, prepares, packs, and marks it ready for pickup.
3. Rider A and Rider B are online.
4. Admin or owning store offers the `DeliveryJob` to Rider A.

### Steps

1. Open Rider A workspace.
2. Open Rider B workspace.
3. Refresh both.

### Expected

- Rider A sees exactly one addressed offer with countdown.
- Rider B sees no offer.
- No public nearby-order list exists.
- Rider B cannot discover the order through mobile APIs or sockets.

### API proof

```text
GET /orders/dispatch/rider/workspace
```

Rider A response contains the assignment in `pendingOffers`. Rider B response does not.

### Evidence

- Screenshot: Rider A offer.
- Screenshot: Rider B empty addressed-offer state.
- Captured API responses with tokens removed.

## Scenario C — Offer countdown and expiry

### Steps

1. Create an offer with a short expiry.
2. Observe the countdown in Rider A workspace.
3. Wait until it reaches zero.
4. Attempt acceptance after expiry.

### Expected

- Countdown never becomes negative.
- Expired offer becomes non-actionable and disappears after refresh.
- Acceptance returns conflict/expired response.
- Delivery job remains `WAITING_FOR_DISPATCH`.
- Rider remains available.

## Scenario D — Offer rejection

### Steps

1. Offer a job to Rider A.
2. Rider A taps Reject and confirms.
3. Dispatcher opens dispatch board.

### Expected

- Assignment becomes `REJECTED` with reason `RIDER_DECLINED`.
- Job remains available for a new offer.
- Rider A is not marked busy.
- Rejected offer is not actionable again.

## Scenario E — Offer acceptance and single active delivery

### Steps

1. Offer a job to Rider A.
2. Rider A accepts.
3. Attempt to offer/accept a second active job for Rider A.

### Expected

- First assignment becomes `ACCEPTED`.
- Delivery job becomes `RIDER_ASSIGNED`.
- Rider A becomes `BUSY`.
- Workspace shows exactly one current delivery.
- Second acceptance is rejected until the first delivery ends.
- Rider B cannot accept Rider A's assignment ID.

## Scenario F — Store pickup gate

### Steps

1. Rider A taps **Start trip to store**.
2. Rider A taps **I arrived at the store**.
3. Observe the workspace before store verification.
4. Store Owner verifies pickup.

### Expected sequence

```text
RIDER_ASSIGNED
→ RIDER_EN_ROUTE_TO_STORE
→ RIDER_AT_STORE
→ PICKUP_VERIFIED
```

- Rider cannot jump from `RIDER_AT_STORE` directly to `OUT_FOR_DELIVERY`.
- While waiting, UI clearly says the store must verify handoff.
- After store verification, **Start customer delivery** becomes available.

## Scenario G — Customer delivery sequence

### Steps

1. Rider starts customer delivery.
2. Rider navigates to customer.
3. Rider marks arrival.
4. Rider confirms delivery.

### Expected sequence

```text
PICKUP_VERIFIED
→ OUT_FOR_DELIVERY
→ RIDER_AT_CUSTOMER
→ DELIVERED
```

- Only the next valid action is visible.
- Customer receives delivery notifications.
- Delivery proof metadata includes `RIDER_CONFIRMATION`.
- Order legacy status is synchronized to `DELIVERED`.
- Rider becomes available after completion.

## Scenario H — Foreground live tracking

### Steps

1. Accept a delivery as Rider A.
2. Keep Partners app in foreground.
3. Move at least 100 metres or use emulator route simulation.
4. Open customer order detail on web/customer mobile.

### Expected

- Exactly one GPS watcher is active.
- Tracking starts only after assignment acceptance.
- Lower frequency is used before pickup.
- Higher frequency is used after pickup/out-for-delivery.
- Customer map updates rider marker.
- Last-updated timestamp changes.
- Accuracy and offline queue count appear in Rider A tracking panel.

## Scenario I — Offline location queue and retry

### Steps

1. Start an active delivery.
2. Disable mobile data/Wi-Fi while GPS remains enabled.
3. Move or simulate locations.
4. Confirm queued count increases.
5. Restore network connectivity.

### Expected

- Location failures do not alter delivery state.
- Pings persist locally with unique `clientPingId` and monotonic `sequence`.
- Queue flushes in order after connectivity returns.
- Duplicate HTTP retry creates only one database ping.
- Customer tracking resumes without a state transition.

### Database proof

For a repeated `clientPingId`, only one `RiderLocationPing` row exists.

## Scenario J — Out-of-order and invalid GPS protection

### Steps

Submit test pings with:

1. lower sequence than the latest accepted sequence;
2. captured time more than 24 hours old;
3. captured time too far in the future;
4. impossible speed jump;
5. Rider B token for Rider A's order.

### Expected

- Every request is rejected with a specific validation or authorization error.
- No rider coordinates are updated.
- No customer socket event is emitted.
- Delivery status remains unchanged.

## Scenario K — Background notification opens rider workspace

### Steps

1. Register Rider A device for `FCM_MOBILE`.
2. Put Partners app in background or lock the phone.
3. Dispatcher offers a job to Rider A.
4. Tap the Android notification.

### Expected

- Rider A receives the notification.
- Rider B receives nothing.
- Notification opens Partners and refreshes the canonical workspace.
- The addressed offer appears.
- No public queue or self-assignment fallback runs.

## Scenario L — Token rotation and logout isolation

### Steps

1. Sign in as Rider A on two devices.
2. Confirm two active `FCM_MOBILE` subscriptions.
3. Rotate/reinstall token on Device 1.
4. Log out Device 1.
5. Send an addressed notification.

### Expected

- Token refresh upserts the current device safely.
- Logging out deactivates only Device 1 subscription.
- Device 2 remains active and receives the notification.
- Raw FCM tokens are not logged.

## Scenario M — Physical Android background tracking

This is a mandatory manual capability test; an emulator or unit test is not sufficient.

### Steps

1. Start an active delivery on a physical Android device.
2. Grant precise/background location permission as required by the OS.
3. Put the app in background and lock screen for at least five minutes.
4. Move the device along a safe route.
5. Observe customer tracking and Android persistent notification behavior.
6. Remove the app from recents and repeat.
7. Enable battery saver and repeat.

### Expected

Record the result honestly:

- `PASS` only if location continues under the tested state.
- `PARTIAL` if it works in background but stops after process removal or OEM battery restriction.
- `FAIL` if updates stop immediately.

Do not claim killed-process tracking unless proved on the physical device. Record device model, Android version, battery setting, and observed update intervals.

## Scenario N — Terminal tracking shutdown

### Steps

1. Complete or cancel the delivery.
2. Observe Rider tracking panel.
3. Attempt another location ping for the terminal job.

### Expected

- GPS watcher stops.
- Local queue flush is attempted once.
- Server rejects further terminal-job pings.
- Customer receives no further rider movement events.
- Rider status is released according to delivery workflow.

## Required screenshots and records

Store proof under:

```text
docs/qa/phase-2b-mobile/
```

Recommended names:

```text
01-role-boundaries.png
02-rider-a-addressed-offer.png
03-rider-b-no-offer.png
04-offer-expired.png
05-current-delivery.png
06-store-pickup-gate.png
07-out-for-delivery.png
08-customer-live-tracking.png
09-offline-location-queue.png
10-delivery-completed.png
11-background-notification.png
12-android-background-tracking.png
```

Also record:

- exact branch SHA;
- API/full/mobile test totals;
- Android APK build result;
- device model and Android version;
- Firebase project environment used, without secrets;
- scenario status table with `PASS`, `PARTIAL`, or `FAIL`;
- any known limitation rather than marking it as passed.

## Merge gate

Do not merge Phase 2B until:

- all automated suites and builds pass;
- Android debug APK builds in CI;
- scenarios A–L and N pass;
- Scenario M has honest physical-device evidence;
- no obsolete mobile app or rider queue path remains;
- customer web notification and tracking regressions remain green;
- CodeQL and CodeQL Advanced pass.
