# Phase 1 Notification Scenario Testing

Branch: `phase-1-web-push-notification-foundation`

Use this checklist to report working and failing behavior. Keep the PR in draft until automated tests and the browser-background scenarios pass.

## 1. Pull and install

```bash
git fetch origin
git checkout phase-1-web-push-notification-foundation
git pull origin phase-1-web-push-notification-foundation
npm install
```

Confirm:

```bash
git branch --show-current
git rev-parse HEAD
```

## 2. Apply database migration

Use a local/test PostgreSQL database.

```bash
npx prisma validate --schema=packages/database/prisma/schema.prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma
npx prisma migrate status --schema=packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

Expected migration:

```text
20260711083000_phase_1_notification_outbox
```

Verify tables:

```text
PushSubscription
NotificationPreference
OutboxEvent
Notification
NotificationRecipient
NotificationDeliveryAttempt
```

Verify triggers:

```sql
SELECT tgname
FROM pg_trigger
WHERE tgname IN (
  'Order_phase1_notification_outbox',
  'DeliveryEvent_phase1_notification_outbox'
);
```

Expected: two rows.

## 3. Automated gate

```bash
npm run test:phase1 --workspace=apps/api-gateway
npm test
npx turbo build --force
npx playwright test --project=phase-0-dispatch
```

Report:

```text
Prisma validate:
Prisma generate:
Migration deploy:
Phase 1 tests:
Full tests:
Turbo build:
Phase 0 Playwright regression:
First complete error block:
```

## 4. Firebase configuration

Create a Firebase web app and web push certificate. Configure:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
FIREBASE_WEB_API_KEY
FIREBASE_WEB_AUTH_DOMAIN
FIREBASE_WEB_PROJECT_ID
FIREBASE_WEB_STORAGE_BUCKET
FIREBASE_WEB_MESSAGING_SENDER_ID
FIREBASE_WEB_APP_ID
FIREBASE_WEB_VAPID_KEY
```

Never commit the service-account JSON or private key.

Confirm authenticated request:

```bash
curl -s http://localhost:3000/notifications/push/config \
  -H "Authorization: Bearer USER_TOKEN"
```

Expected:

```json
{
  "enabled": true,
  "vapidKey": "...",
  "firebaseConfig": {
    "apiKey": "...",
    "projectId": "..."
  }
}
```

## 5. Scenario A — Order placement is transactional and rider-safe

### Steps

1. Log in as customer.
2. Place one valid COD order.
3. Query `OutboxEvent` by the order ID.
4. Open store notifications.
5. Open admin notifications.
6. Open Rider A and Rider B notifications/workspaces.

### Expected

- exactly one `ORDER_PLACED` outbox event
- store owner receives the notification
- admins receive the notification
- no rider receives an order-placement notification
- no rider receives a `newOrderNearby` socket event
- order placement succeeds even if Firebase is not configured

```text
A1 Order created:
A2 One ORDER_PLACED event:
A3 Store received:
A4 Admin received:
A5 Rider A did not receive:
A6 Rider B did not receive:
A7 No legacy rider socket event:
A8 Checkout unaffected without Firebase:
First error block:
```

## 6. Scenario B — Store status notifications

### Steps

1. Continue the order.
2. Store confirms/accepts the order if needed.
3. Store starts picking.
4. Store marks ready for pickup.
5. Process outbox automatically or call the admin processing endpoint.

### Expected

- customer receives accepted update
- customer receives picking update
- admin receives packed/dispatch-ready update
- no rider receives packed order until selected by dispatch
- duplicate page refresh/status retry does not duplicate inbox entries

```text
B1 Accepted → customer:
B2 Picking → customer:
B3 Packed → admin:
B4 Packed hidden from riders:
B5 No duplicate notifications:
First error block:
```

## 7. Scenario C — Selected rider only

### Steps

1. Keep Rider A and Rider B online.
2. Admin offers the packed delivery to Rider A.
3. Close both rider browser tabs before the offer.
4. Wait for the background push.
5. Inspect both rider inboxes.

### Expected

- Rider A receives one `ASSIGNMENT_OFFERED`
- Rider B receives nothing
- Rider A background notification contains store/order context
- clicking opens `/rider`
- assignment remains `OFFERED`; push delivery does not accept it

```text
C1 Rider A push received:
C2 Rider A inbox received:
C3 Rider B did not receive:
C4 Click opened /rider:
C5 Assignment still OFFERED:
First error block:
```

## 8. Scenario D — Multi-device subscription

### Steps

1. Log in as the same rider in Chrome profile A.
2. Enable background alerts.
3. Log in in Chrome profile B or a second device.
4. Enable background alerts.
5. Call `GET /notifications/push/subscriptions`.
6. Send an addressed assignment offer.

### Expected

- two active subscriptions exist for one user
- both devices receive the offer
- only one inbox recipient exists
- disabling one subscription leaves the other active

```text
D1 Device A registered:
D2 Device B registered:
D3 Two subscriptions:
D4 Both devices pushed:
D5 One inbox recipient:
D6 One device disabled safely:
First error block:
```

## 9. Scenario E — Acceptance and delivery timeline

### Steps

1. Rider accepts.
2. Rider starts trip to store.
3. Rider arrives at store.
4. Store verifies pickup.
5. Rider starts delivery.
6. Rider arrives at customer.
7. Rider completes delivery.

### Expected matrix

```text
Assignment accepted → customer, store, admin
Rider en route to store → store, admin
Rider at store → store
Pickup verified → customer, admin
Out for delivery → customer
Rider at customer → customer
Delivered → customer, store, rider, admin
```

No event should be delivered twice.

```text
E1 Accepted routing:
E2 En-route routing:
E3 At-store routing:
E4 Pickup routing:
E5 Out-for-delivery routing:
E6 At-customer routing:
E7 Delivered routing:
E8 No duplicates:
First error block:
```

## 10. Scenario F — Read/open isolation

### Steps

1. Record `OrderStatusHistory` count for an order.
2. Open customer notification page.
3. Mark one notification read.
4. Click one notification.
5. Recount order history.
6. Inspect `NotificationRecipient`.

### Expected

- order-history count is unchanged
- recipient has `readAt`
- recipient has `openedAt`
- recipient status is `READ`
- another user cannot mark it read/open

```text
F1 History unchanged:
F2 readAt stored:
F3 openedAt stored:
F4 Status READ:
F5 Cross-user operation blocked:
First error block:
```

## 11. Scenario G — Duplicate processing and idempotency

### Steps

1. Record one outbox event ID.
2. Call process-outbox twice concurrently.
3. Retry the originating API request where safe.
4. Count notification and recipient rows.

### Expected

- one `Notification` for one outbox event
- one recipient row per user
- one inbox card per event
- outbox reaches `PROCESSED`

```text
G1 Concurrent processing safe:
G2 One notification:
G3 One row per recipient:
G4 One inbox card:
G5 Outbox processed:
First error block:
```

## 12. Scenario H — Invalid token and retry

### Steps

1. Insert/use an expired Firebase token for a test user.
2. Send a routed notification.
3. Inspect delivery attempt and subscription.
4. Check outbox retry fields.

### Expected

- failed attempt stores provider error
- invalid subscription becomes inactive
- other active devices remain active
- outbox failure stores `lastError`
- `availableAt` moves forward for retry
- order/delivery state remains committed and unchanged

```text
H1 Attempt FAILED:
H2 Error recorded:
H3 Token deactivated:
H4 Other device active:
H5 Retry scheduled:
H6 Business state unchanged:
First error block:
```

## 13. Scenario I — Preferences

### Steps

1. Set global push preference off.
2. Trigger an event.
3. Check in-app inbox and push attempts.
4. Disable in-app for one event type.
5. Trigger that event again with a fresh aggregate.

### Expected

- global push off keeps in-app notification
- no provider send occurs when push is disabled
- event-specific in-app off prevents recipient creation
- other event types are unaffected

```text
I1 Push preference off:
I2 In-app still present:
I3 No push attempt:
I4 Event in-app disabled:
I5 Other events unaffected:
First error block:
```

## 14. Scenario J — Admin broadcast

### Steps

1. Open `/admin/notifications`.
2. Select a test audience.
3. Queue the broadcast.
4. Repeat with the same Idempotency-Key through API.
5. Process outbox.

### Expected

- real outbox event is created
- response says `QUEUED`, not placeholder
- selected audience receives it
- users outside audience do not
- repeated key creates no duplicate

```text
J1 Broadcast queued:
J2 Correct audience:
J3 Other roles excluded:
J4 Duplicate key safe:
J5 Inbox rendered:
First error block:
```

## 15. Scenario K — Background browser proof

Test Chrome desktop and one mobile/PWA-capable browser.

### Steps

1. Enable alerts.
2. Close the application tab.
3. Trigger a notification.
4. Capture the system notification.
5. Click it.
6. Repeat while the app is foregrounded.

### Expected

- background notification appears with icon/title/body
- click focuses an existing window or opens a new one
- role-safe route opens
- foreground notification appears once
- unread badge refreshes
- no duplicate browser notifications

```text
K1 Desktop background:
K2 Desktop click/deep link:
K3 Mobile/PWA background:
K4 Mobile click/deep link:
K5 Foreground behavior:
K6 Badge refresh:
K7 No duplicate display:
Screenshots:
First error block:
```

## 16. Scenario L — Phase 0 regression

Re-run the Phase 0 delivery scenarios most affected by notifications:

- packed job appears once
- offer is addressed to one rider
- concurrent acceptance remains safe
- pickup sequence remains enforced
- delivery completes
- rider returns online
- database has no duplicate jobs/assignments

```text
L1 Packed job:
L2 Selected rider offer:
L3 Concurrent acceptance:
L4 Pickup workflow:
L5 Delivery complete:
L6 Rider released:
L7 Database clean:
First error block:
```

## 17. Final report

```text
Phase 1 focused tests:
Full test suite:
Turbo build:
CodeQL:
CodeQL Advanced:
Migration:
Order/store/admin routing:
Selected rider only:
Multi-device push:
Background push:
Deep links:
Read/open isolation:
Retry/invalid token:
Preferences:
Admin broadcast:
Phase 0 regression:
Overall result: PASS / FAIL
Blocking issues:
Non-blocking follow-ups:
```
