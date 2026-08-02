# Store rider-arrival pickup notification proof

Branch: fix/store-pickup-push-alerts

## Scope

This change makes the store owner see and reach pickup verification immediately after the assigned rider transitions to RIDER_AT_STORE.

The durable notification/outbox event remains the source of truth. Push is an accelerator; the store queue continues polling every 15 seconds and is invalidated by foreground/opened/cold-start notification callbacks.

## Implemented surfaces

- Store Dashboard: Firebase foreground listener, opened-app listener, cold-start listener, in-app toast, live pickup banner.
- Store Operations tab: live red badge with the number of RIDER_AT_STORE jobs.
- Store Order Details: live pickup-state lookup and prominent Verify Pickup action.
- App-level partner notification routing: RIDER_AT_STORE opens StorePickupVerification for store owners.
- Shared queue key: ['store', 'delivery-operations'].

## Required local/device proof

Use a real store-owner and rider account. Do not use fabricated screenshots or debug APKs.

1. Place a customer order and have the store accept, pick and mark it ready.
2. Let the dispatcher offer the job to the rider; accept it with the rider app.
3. From Rider Operations, complete the pickup checklist and tap I arrived at store.
4. With the store app foregrounded on Dashboard, capture:
   - 01-store-dashboard-rider-arrived-toast.png
   - 02-store-dashboard-pickup-banner.png
   - 03-store-operations-red-badge.png
5. Tap the notification while the store app is backgrounded and capture:
   - 04-store-notification-opened-pickup-verification.png
6. Force-stop and relaunch the store app from the notification and capture:
   - 05-store-cold-start-pickup-verification.png
7. Open the same order from Orders → Order Details and capture:
   - 06-store-order-details-verify-pickup.png
8. Complete pickup verification and capture:
   - 07-store-pickup-proof-completed.png

## Acceptance assertions

- The store receives the notification only for its own store's delivery job.
- Foreground push shows an in-app alert and refreshes the queue.
- Opened-app and cold-start push navigate to Store Pickup → Rider handoff.
- Dashboard banner, Operations badge, and Order Details action disappear after the backend state leaves RIDER_AT_STORE.
- Store ownership and pickup checklist authorization remain enforced by the API.
- The transition remains RIDER_AT_STORE → PICKUP_VERIFIED → OUT_FOR_DELIVERY.

## CI commands

The PR must run the existing partner checks, including:

    pnpm --filter AagamPartners typecheck
    pnpm --filter AagamPartners test
    pnpm --filter AagamPartners test:order-delivery-ui
    git diff --check

The release workflow must provide the production partner APK and device screenshots. Do not mark this proof complete from source contracts alone.
