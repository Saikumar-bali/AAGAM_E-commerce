# Offline Customers & Custom Store-Managed Subscriptions

## What exists today (grounding)

- An **offline-customer primitive already exists**: `createOfflineCustomer` in `apps/api-gateway/src/subscriptions/subscription-admin-reporting.service.ts:289` creates a `User` (role CUSTOMER, synthetic email `offline.<phone>@aagaam.local`) + a `CustomerAddress` — but with hard-coded fallback coordinates when no lat/lng is given, and it's only reachable from the **admin** "Manual Subscription" modal.
- `createManualSubscription` (same file :337) can only attach an **existing published plan**, generates one `SubscriptionDelivery` row per day, and has a latent bug: `BOTH` slot creates two rows on the same date which get silently dropped by the `@@unique([subscriptionId, serviceDate])` constraint.
- The subscription engine (delivery rows → `subscription-order-generator` → real `Order` + COD + entitlements) is exactly what tracking should reuse.
- The web map UX to reuse is already in the repo: `CustomerLocationPicker` (Mapbox satellite + search + draggable pin) and the two-step full-screen modal pattern from the merged checkout address form (PR #293).
- Store portal (`(store)/store/*`, `STORE_OWNER` role, owner-scoped via `Store.ownerId`) has orders + subscription-operations pages but nothing for offline customers.

## Plan (all decisions per your answers: store-managed, presets + date picker, flexible cash, name+phone verify)

### 1. Schema (one Prisma migration, handwritten SQL per repo pattern)
- `User.acquisitionSource String?` — set to `'OFFLINE_STORE'` for offline customers (makes them a first-class, queryable segment — your point 6).
- `SubscriptionDelivery.deliverySlot String @default("AM")` (`AM` | `PM` | `BOTH`) — one row per date, fixes the BOTH dedup bug and gives you per-day AM/PM/both tracking.
- `SubscriptionDelivery.cashCollectedPaise Int @default(0)`, `cashCollectedAt DateTime?`, `deliveredByStoreUserId String?`.
- `CustomerSubscription.source String?` (`'CUSTOM_OFFLINE'`) — custom offline schedules don't pretend to be plans.
- Migration folder `packages/database/prisma/migrations/20260908000000_offline_custom_store_subscriptions/`.

### 2. API — new store-scoped module `store-offline-customers`
`apps/api-gateway/src/store-offline-customers/` (controller roles `STORE_OWNER, ADMIN`, tenancy via existing `assertOwnedStore`/ownerId pattern):
- `GET /store/offline-customers` — list with per-customer aggregates (active subs, days delivered/left, collected/due, last order).
- `POST /store/offline-customers` — create/update offline customer + address **with real latitude/longitude** (no more fallback pin).
- `GET/PATCH /store/offline-customers/:id` — profile, addresses, subscriptions with tracking rollups, recent orders.
- `POST /store/offline-customers/:id/subscriptions` — **fully custom assignment** (your point 2): `serviceDates: [{date, slot}]`, optional items picked from the store's own inventory, manual total price, cash collected now. Presets are a UI concern; API takes the concrete date+slot list.
- `POST /store/subscriptions/:id/pause | /resume` (resume can shift remaining scheduled dates to a new start, preserving the day-pattern and slots) — your point 6.
- `POST /store/subscriptions/:id/collect-cash` — flexible cash: records collected amount against the subscription (collected vs due tracking, your answer "flexible cash").
- `POST /store/orders/:id/complete-delivery` — **store self-delivery** (your points 3 & 5): verifies `{customerName, phoneLast4}` against the order's address snapshot, transitions the offline order straight to `DELIVERED` (no rider), stamps `deliveredByStoreUserId`, marks the `SubscriptionDelivery` DELIVERED, records its cash, and reuses the existing entitlement reconciliation (`reconcileDeliveredWithinTransaction`) so completed/remaining counts stay consistent.

### 3. Generator tweaks (small, surgical)
`subscription-order-generator.service.ts`: for `source === 'CUSTOM_OFFLINE'` subscriptions use `delivery.deliverySlot` (falling back to the subscription window) for the window minutes, prefer `homeStoreId` over inventory-based store resolution, and **skip DeliveryJob/run creation** — offline orders stay store-owned end-to-end instead of entering rider dispatch.

### 4. Store portal UI (admin-dashboard)
- New page `/store/offline-customers` (+ detail page): customer list searchable by name/phone, per-customer view with **the tracking table you described** (point 4): each subscription row shows schedule summary, total days, days delivered, days left, money collected, money due, served orders split **AM / PM / BOTH** counts, next delivery date, status — plus pause/resume, collect-cash, and full order history per customer.
- "Add offline customer" modal reusing the **two-step full-screen map picker** (search + satellite + draggable pin → details) exactly like the customer checkout flow (point 1).
- "Assign custom subscription" wizard: preset builders (daily × N, every N days, N consecutive days, single pre-order) that populate an editable **calendar date picker where each date is tagged AM/PM/BOTH**; basket from store inventory (optional) + manual price; cash collected now.
- `/store/orders`: offline orders get a **"Mark delivered"** action (from CONFIRMED/PICKING/PACKED) opening a verify modal showing the customer's name + phone with last-4 confirmation (point 5).

### 5. Workflow, tests, delivery
- Branch `feat/offline-customers-store-subscriptions` off latest `main`, phased commits (schema+API → generator → store UI), pushed to GitHub, PR opened — same git-centric flow as before (no local installs; portable git from temp).
- Jest service tests following existing `apps/api-gateway/src/*.spec.ts` patterns: schedule validation (past dates, empty list, AM/PM/BOTH), complete-delivery verification (wrong phone rejected, double-delivery rejected), cash collection math, and store tenancy (owner B cannot see owner A's offline customers).
- CI: the PR will run the standard pipeline; the known pre-existing `npm integrity` policy failure on `main` is unrelated and documented in the PR.

**Scope note:** this is a large feature (~2 schema touches, 1 new API module, 1 generator change, 2 new store pages + wizard + order action). I'll build it in the order above so each commit is coherent, and flag anything ambiguous during implementation rather than inventing scope.