# Phase 2 — Web-First Execution Gate

Branch: `phase-2-mobile-delivery-live-tracking`

Base:

```text
e081c166c4fa42a4eb1e3d8bd1734bbf42f1e005
```

## Decision

Phase 2 remains on the current branch, but execution is split into two hard stages.

No mobile application implementation, mobile folder deletion, Android build change, rider API migration, or background-location work may begin until Stage A is accepted.

## Stage A — Complete and verify the web platform

### Implemented on this branch

#### Web push worker stabilization

- API reports push enabled only when all required public Firebase values and the VAPID key exist.
- Missing and whitespace-only variables are named explicitly.
- Browser registration passes the exact API-provided Firebase config to the service-worker URL.
- The worker does not execute Firebase imports when configuration is absent.
- Firebase import/initialization failures are caught and exposed through worker health diagnostics instead of causing an opaque script-evaluation failure.
- Worker install, activation, update and health-check behavior is explicit.
- Existing workers are updated safely; the client waits for the newly installed worker to activate before checking health.
- The UI distinguishes configuration, permission, worker, browser Firebase, token and backend subscription failures.

#### Notification preference completion

- Admin, customer, store and rider each have a dedicated notification settings page.
- Global push and in-app defaults remain supported.
- Event-specific push and in-app preferences are available for events relevant to each role.
- Settings persist through the existing notification preference API.
- Notification centers provide a direct Preferences link.
- Responsive and mobile-width web layouts are covered.

#### Existing customer web tracking

The customer order detail already contains:

- live rider/store/destination map markers
- Socket.IO location updates with polling fallback
- live, stale, assigned-no-location, completed and cancelled states
- last-update time
- ETA and distance labels when available
- safe empty states when coordinates are missing

This functionality must remain regression-green during Stage A.

## Stage A automated gate

```bash
npm install
npm run test:phase1 --workspace=apps/api-gateway
npm test
npx turbo build --force
npx playwright test --project=phase-1-notifications --headed
```

Required proof:

- Firebase config contract tests pass.
- Service-worker endpoint returns JavaScript, not HTML.
- Health-only worker installs and activates without Firebase credentials.
- All four role settings pages render.
- Preference persistence test passes and restores its original value.
- Notification settings have no mobile-width overflow.
- Full API tests, build, CodeQL and CodeQL Advanced pass.

## Stage A manual gate

Configure the **API service** using:

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

The dashboard no longer requires a duplicate Firebase configuration for normal registration. It receives the public values from the authenticated API endpoint and passes them to the worker script URL.

Opening `http://localhost:3001/firebase-messaging-sw.js` directly may still show an empty fallback config when dashboard-side Firebase variables are not set. That direct response is no longer the normal registration path. Clicking **Enable background alerts** registers a query-configured worker using the complete values returned by the API.

Before retesting once, run in the browser console:

```js
const registrations = await navigator.serviceWorker.getRegistrations();
await Promise.all(registrations.map((registration) => registration.unregister()));
localStorage.removeItem('aagam_push_enabled');
localStorage.removeItem('aagam_push_subscription_id');
location.reload();
```

Then prove in Chrome:

1. Sign in as each role and open its notification center.
2. Click **Enable background alerts**.
3. Confirm `/firebase-messaging-sw.js?...` is installed and active for scope `/`.
4. Confirm the UI shows background alerts enabled only after worker health, FCM token creation and backend subscription storage succeed.
5. Close or background the tab and send a role-addressed notification.
6. Confirm the operating-system notification appears.
7. Click it and verify the correct role-safe deep link and `openedAt` acknowledgement.
8. Change an event-specific preference and verify routing respects it.
9. Verify another role or unselected rider receives nothing.

## Stage B — Mobile consolidation and delivery operations

Stage B starts only after Stage A is explicitly accepted.

Planned first actions:

1. Remove obsolete `apps/mobile-app` and all references.
2. Keep `apps/mobile-customer` for customers.
3. Keep one `apps/mobile-partners` application for rider, store owner and limited admin workflows using role-based navigation.
4. Migrate the Partners rider workspace away from public rider queues, self-assignment and generic order-status mutations.
5. Register `FCM_MOBILE` subscriptions through the Phase 1 multi-device notification domain.
6. Implement and honestly verify foreground/background rider tracking.

The detailed Stage B scope remains in:

```text
docs/PHASE_2_MOBILE_DELIVERY_LIVE_TRACKING_PLAN.md
```
