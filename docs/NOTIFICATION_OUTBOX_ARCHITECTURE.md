# Notification and Transactional Outbox Architecture

Branch: `phase-1-web-push-notification-foundation`

## Purpose

Phase 1 replaces order-history-derived notifications and direct rider broadcasts with a durable communication domain. Business state and notification intent are committed together. Push delivery can then retry independently without repeating the commercial operation.

## Problems removed

The previous implementation had these risks:

- one `User.fcmToken` supported only one device
- checkout notified every rider before an assignment existed
- inbox items were reconstructed from `OrderStatusHistory`
- marking an item read wrote another `OrderStatusHistory` row
- direct Firebase sends had no persistent retry or attempt audit
- a failed push could be lost permanently
- browser notification clicks had no consistent role-safe deep link

The old `fcmToken` field remains temporarily for backward compatibility, but new registration and delivery use `PushSubscription`.

## Data model

### `OutboxEvent`

Stores notification intent inside the same PostgreSQL transaction as the business change.

Important fields:

- `eventType`
- `aggregateType`
- `aggregateId`
- `payload`
- `idempotencyKey`
- `status`
- `attempts`
- `availableAt`
- `lockedAt`
- `processedAt`
- `lastError`

### `Notification`

Stores the rendered message shared by recipients:

- title
- body
- event type
- order/job references
- deep-link/data payload
- source outbox event

### `NotificationRecipient`

Stores one user's inbox and engagement state:

- `QUEUED`
- `SENT`
- `FAILED`
- `OPENED`
- `READ`

Read/open state no longer modifies `OrderStatusHistory`.

### `PushSubscription`

Supports multiple devices per user. Phase 1 supports Firebase tokens and leaves fields for standards-based Web Push endpoints.

A subscription can be invalidated without deleting notification history.

### `NotificationDeliveryAttempt`

Records every provider attempt, response ID, error code, retry time and subscription used.

### `NotificationPreference`

Provides global (`*`) and event-specific push/in-app preferences.

## Transactional event capture

PostgreSQL triggers are the final consistency guard.

### Order trigger

- order insert → `ORDER_PLACED`
- `PENDING`/`PAYMENT_PENDING` → `CONFIRMED` → `STORE_ACCEPTED_ORDER`
- any valid transition to `PICKING` → `STORE_STARTED_PICKING`
- `CONFIRMED`/`PICKING` → `PACKED` → `ORDER_PACKED`
- transition to `CANCELLED` → `DELIVERY_CANCELLED`

The insert/update and outbox row are one database transaction. If either fails, both roll back.

### Delivery event trigger

Delivery events map to notification events:

| Delivery event/status | Notification event |
|---|---|
| `JOB_CREATED` | `DISPATCH_JOB_CREATED` |
| `ASSIGNMENT_OFFERED` | `ASSIGNMENT_OFFERED` |
| `ASSIGNMENT_ACCEPTED` | `ASSIGNMENT_ACCEPTED` |
| `ASSIGNMENT_REJECTED` | `ASSIGNMENT_REJECTED` |
| `ASSIGNMENT_EXPIRED` | `ASSIGNMENT_EXPIRED` |
| `RIDER_EN_ROUTE_TO_STORE` | `RIDER_EN_ROUTE_TO_STORE` |
| `RIDER_AT_STORE` | `RIDER_AT_STORE` |
| `PICKUP_VERIFIED` | `PICKUP_VERIFIED` |
| `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` |
| `RIDER_AT_CUSTOMER` | `RIDER_AT_CUSTOMER` |
| `DELIVERED` | `DELIVERY_COMPLETED` |
| `DELIVERY_FAILED` | `DELIVERY_FAILED` |
| `CANCELLED` | `DELIVERY_CANCELLED` |

## Recipient matrix

| Event | Customer | Store | Selected rider | Admin |
|---|---:|---:|---:|---:|
| `ORDER_PLACED` | No | Yes | No | Yes |
| `STORE_ACCEPTED_ORDER` | Yes | No | No | No |
| `STORE_STARTED_PICKING` | Yes | No | No | No |
| `ORDER_PACKED` | No | No | No | Yes |
| `DISPATCH_JOB_CREATED` | No | No | No | Yes |
| `ASSIGNMENT_OFFERED` | No | No | **Yes, addressed only** | No |
| `ASSIGNMENT_ACCEPTED` | Yes | Yes | No | Yes |
| `ASSIGNMENT_REJECTED` | No | Yes | No | Yes |
| `ASSIGNMENT_EXPIRED` | No | Yes | No | Yes |
| `RIDER_EN_ROUTE_TO_STORE` | No | Yes | No | Yes |
| `RIDER_AT_STORE` | No | Yes | No | No |
| `PICKUP_VERIFIED` | Yes | No | No | Yes |
| `OUT_FOR_DELIVERY` | Yes | No | No | No |
| `RIDER_AT_CUSTOMER` | Yes | No | No | No |
| `DELIVERY_COMPLETED` | Yes | Yes | Yes | Yes |
| `DELIVERY_FAILED` | Yes | Yes | No | Yes |
| `DELIVERY_CANCELLED` | Yes | Yes | No | Yes |

`ASSIGNMENT_OFFERED` resolves the exact `riderUserId`. It never queries all riders.

## Worker behavior

`NotificationWorkerService` runs periodically outside tests.

1. Recover processing locks older than five minutes.
2. Claim pending/failed rows using conditional updates.
3. Materialize one `Notification` per outbox event.
4. Create one deduplicated recipient row per routed user.
5. Deliver through every active device subscription.
6. Record every attempt.
7. Mark processed, or schedule exponential retry.

Maximum automatic outbox attempts: five.

Backoff begins at 10 seconds and is capped at five minutes.

## Idempotency

- `OutboxEvent.idempotencyKey` is unique.
- `Notification.outboxEventId` is unique.
- `NotificationRecipient.dedupeKey` is unique.
- notification and recipient creation tolerate concurrent workers.
- push attempts have a compound uniqueness constraint.

Repeating an API request or worker pass cannot create duplicate inbox entries.

## Browser push flow

1. User clicks **Enable background alerts**.
2. Browser requests notification permission.
3. `/firebase-messaging-sw.js` is registered at root scope.
4. Firebase issues a token using the VAPID key.
5. Client registers the token through `/notifications/push/subscriptions`.
6. Backend stores it as one device subscription.
7. Foreground messages refresh the unread count and display a browser notification.
8. Background messages are shown by the service worker.
9. Clicking opens the role-safe deep link.

## Invalid subscriptions

Firebase errors such as registration-token-not-registered and invalid-registration-token deactivate only that subscription. Other devices remain active.

## Legacy migration behavior

Historical inbox items can still be read from old order history during transition. Once a legacy item is marked read, it is migrated into the dedicated notification tables. The compatibility layer never writes a new read receipt into order history.

New order and delivery events use only the outbox and dedicated tables.

## Security boundaries

- all inbox/subscription/preference routes require JWT authentication
- a user can list or disable only their own subscriptions
- read/open operations require recipient ownership
- admin broadcast and outbox inspection are admin-only
- deep links do not bypass existing page/API authorization
- legacy rider queue socket subscriptions are blocked
- legacy all-rider `NEW_ORDER` push is explicitly skipped

## Operational configuration

Required for push delivery:

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

Without Firebase credentials, the in-app inbox remains fully functional. Push attempts are recorded as skipped rather than crashing order processing.
