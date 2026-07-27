# End-to-End Delivery Workflow Testing Guide

## Overview

Complete delivery lifecycle across **4 roles** and **5 devices**:

| Role | Device | App | Login |
|------|--------|-----|-------|
| Customer | Mobile 1 | AAGAM Customer | Phone OTP login |
| Store Owner | Mobile 2 | AAGAM Partners | Phone OTP login |
| Rider | Mobile 3 | AAGAM Partners | Phone OTP login |
| Admin | Browser | Web Dashboard | Email/password login |

---

## Phase 0: Setup — Create Test Accounts

### Admin Dashboard Sidebar Navigation (verified from code)

**Admin role sees these pages** (from `Sidebar.tsx` lines 49-62):
- Dashboard, Partner Applications, Analytics, Notifications, Support, Dispatch, Delivery Exceptions, Stores, Products, Delivery Zones, Promotions, **Riders**, Orders, **Live Tracking**

### Step 0.1: Admin creates Rider (Web)
**URL:** `/admin/riders`

1. Login as admin (`admin@aagam.com` / `admin@2026!`)
2. Click **"Riders"** in sidebar → opens `/admin/riders`
3. Click **"Add Rider"** button (green, top right, with `+` icon)
4. Fill form: **Name**, **Email**, **Phone**
5. Submit → rider created with status APPROVED, role RIDER

*Source: `riders/page.tsx` lines 190-195 — `handleSubmit` calls `POST /riders` with `{name, email, phone}`*

### Step 0.2: Admin creates Store Owner + Store (Web)
**URL:** `/admin/stores`

1. Click **"Stores"** in sidebar → opens `/admin/stores`
2. Click **"Add Store"** button (green, with `+` icon)
3. Fill form:
   - **Store name**, **Address**
   - **Pin location on map** (latitude/longitude)
   - **Owner name**, **Owner email**, **Owner phone**, **Password**
4. Submit → creates both the Store record and the Store Owner user account

*Source: `stores/page.tsx` lines 52-64 — `StoreFormData` has `ownerEmail, ownerName, ownerPhone, password` fields. `handleSubmit` calls `POST /stores`*

### Step 0.3: Rider goes online (Mobile Device 3)
1. Open AAGAM Partners app → Login with rider phone/OTP
2. App routes to `RiderTabs` (from `RootNavigator.tsx` line 82)
3. **RiderDashboard** loads — top right shows **Power toggle button** with ONLINE/OFFLINE text
4. Tap the toggle → requests location permission → GPS acquired → status changes to ONLINE
5. Persistent notification appears: **"AAGAM — You are online / Ready to receive delivery offers"**

*Source: `RiderDashboard.tsx` lines 438-465 — `goOnline()` calls `Geolocation.getCurrentPosition` then `riderService.updateMyStatus('ONLINE', {latitude, longitude})`*

### Step 0.4: Store Owner logs in (Mobile Device 2)
1. Open AAGAM Partners app → Login with store phone/OTP
2. App routes to `StoreTabs` (from `RootNavigator.tsx` line 83)
3. **StoreDashboard** shows store name, order count, revenue, inbox badge

### Step 0.5: Customer places first order (Mobile Device 1)
1. Open AAGAM Customer app → Login with phone OTP
2. App routes to `CustomerTabs` (from `RootNavigator.tsx` line 52)
3. **Shop** tab: Browse products → tap product → tap **"Add to Cart"**
4. **Cart** tab: See items → tap **"Proceed to Checkout"**
5. **CheckoutScreen**:
   - Select delivery address (or tap **"+ Add another address"** → pin on map → **"Save and use this address"**)
   - Select payment method: **COD** or **Pay Online**
   - (Optional) Enter coupon code → tap **"Apply"**
   - Review order summary
   - Tap **"Place COD Order"** (or "Continue to Pay")
6. **OrderDetailScreen** opens showing tracking map, status "Waiting for rider assignment..."

*Source: `CheckoutScreen.tsx` lines 166-183 — `placeOrderMutation` calls `POST /checkout/place-order` with `{items, addressId, paymentMethod, couponCode}`*

---

## Scenario C: Offer Countdown & Expiry

### Step C.1: Order becomes PACKED
- Store owner marks order as "Ready for Pickup" from their Orders screen
- This creates a `DeliveryJob` with status `WAITING_FOR_DISPATCH`
- **Auto-dispatch** triggers: system finds nearest ONLINE rider and creates an offer

### Step C.2: Rider sees offer with countdown (Mobile Device 3)
1. **RiderDashboard** shows offer card under "Addressed offers" section
2. Card shows: Order ID, store name, delivery amount (₹)
3. **Countdown badge** shows `60s`, `59s`... counting down
4. Two buttons: **"Accept offer"** (green) and **"Reject"** (red outline)
5. **DO NOT tap either button**
6. Wait for countdown to reach `0s` / "Expired"
7. Offer card becomes greyed out (opacity 0.62), buttons disabled

*Source: `RiderDashboard.tsx` lines 101-160 — `OfferCard` component with `offerSecondsRemaining(offer.expiresAt, now)` countdown, `isOfferActionable()` check*

---

## Scenario D: Rider Rejection

### Step D.1: Admin assigns rider
1. **Dispatch Board** (`/admin/dispatch`): Select rider → click **"Assign Rider"**
2. Offer created with 60s expiry

### Step D.2: Rider rejects
1. Rider sees offer on Dashboard
2. Tap **"Reject"** → Alert dialog: "Reject delivery offer? The dispatcher can offer this job to another rider."
3. Tap **"Reject"** (destructive red)
4. Offer disappears from rider's dashboard

### Step D.3: Verify
- Order reappears on Admin Dispatch Board under "Ready for pickup"
- Auto-dispatch tries next nearest rider
- Rider status returns to ONLINE

*Source: `dispatch-assignment.service.ts` lines 322-421 — `reject()` marks assignment REJECTED, transitions job back to WAITING_FOR_DISPATCH, triggers auto-dispatch for next nearest rider*

---

## Scenario E: Acceptance → One Active Delivery

### Step E.1: Rider accepts
1. Rider sees new offer on Dashboard
2. Tap **"Accept offer"** → Alert: "Accept delivery offer? Pickup from {store name}"
3. Tap **"Accept"**

### Step E.2: Verify
- Dashboard summary shows: **1 Active delivery**, **0 Addressed offers**
- **Current delivery card** shows:
  - Order ID, status chip "RIDER ASSIGNED"
  - **PICKUP** block: Store name, address, **"Navigate to store →"** link
  - **DELIVER TO** block: Customer name, address, **"Navigate"** and **"Call"** buttons
  - **PICKING LIST**: Item names and quantities
  - Action button: **"Start trip to store"** (dark, full-width)
  - Tracking health panel: "Delivery tracking inactive"

### Step E.3: Second delivery blocked
- Admin tries to assign same rider → `409 Conflict: "Rider already has active delivery {id}"`

*Source: `RiderDashboard.tsx` lines 186-293 — `CurrentDelivery` component. Action button from `nextActionForStatus()` in `riderWorkspace.tsx` line 100-103: RIDER_ASSIGNED → action: 'EN_ROUTE_TO_STORE', label: 'Start trip to store'*

---

## Scenario F: Rider at Store → Pickup Verification

### Step F.1: Rider travels to store
1. Tap **"Start trip to store"** → Alert: "Confirm that you are leaving for the pickup store."
2. Status → `RIDER_EN_ROUTE_TO_STORE`
3. Tap **"Navigate to store →"** → opens Google Maps directions

### Step F.2: Rider arrives
1. Tap **"I arrived at the store"** → Alert: "Confirm that you have reached the pickup store."
2. Status → `RIDER_AT_STORE`
3. Dashboard shows yellow waiting panel: "Waiting for pickup verification"
4. **No "Start customer delivery" button** — `nextActionForStatus('RIDER_AT_STORE')` returns null

### Step F.3: Store verifies pickup (Mobile Device 2)
**Method 1 — Notification:**
- Store receives push: "Rider arrived at store / The rider is ready to collect order #XXXX"
- **Tap notification** → navigates to `StorePickupVerification` screen

**Method 2 — Operations tab:**
- Operations tab shows green banner: "1 rider(s) waiting for pickup / Tap to verify parcel handoff"
- **Tap banner** → navigates to `StorePickupVerification` screen

**Method 3 — Direct navigation:**
- From any screen in StoreTabs, navigate to `StorePickupVerification`

**On StorePickupVerification screen:**
- Shows order card with rider name, items list
- **Parcel count** input (default: 1)
- Three verification buttons:
  - **"Issue PIN to rider"** (teal) → 6-digit PIN displayed, share verbally
  - **"Issue QR code"** (blue) → QR code displayed
  - **"Confirm physical handoff"** (green) → direct confirmation

*Source: `StorePickupVerificationScreen.tsx` lines 45-307 — `issueChallenge()` calls `deliveryOperationsService.issuePickupChallenge()`, `confirmHandoff()` calls `deliveryOperationsService.confirmStoreHandoff()`*

### Step F.4: Pickup verified
- Status → `PICKUP_VERIFIED`
- `PickupProof` record created with GPS, parcel count, verification method
- Rider dashboard action changes to: **"Start customer delivery"**

---

## Scenario G: Complete Customer Delivery

### Step G.1: Start delivery
1. Rider Dashboard shows action button: **"Start customer delivery"**
2. Tap → Alert: "Confirm that the verified order is with you."
3. Status → `OUT_FOR_DELIVERY`

### Step G.2: Arrive at customer
1. Tap **"I arrived at the customer"** → Confirm
2. Status → `RIDER_AT_CUSTOMER`

### Step G.3: Issue OTP (Mobile Device 3)
1. Switch to **Operations** tab
2. "Proof of delivery" section shows **"Issue customer OTP"** button
3. Tap → OTP generated server-side
4. Status: "Ask the customer for the current 6-digit code."

### Step G.4: Customer gets OTP (Mobile Device 1)
1. Customer opens **Order Detail** screen
2. 6-digit code is visible (e.g., `483921`)

### Step G.5: Rider records POD (Mobile Device 3)
1. Enter 6-digit OTP in input field
2. Check **"I confirm the parcel was physically handed to the customer"** checkbox
3. (Optional) Add delivery note
4. Tap **"Verify OTP and record POD"**
5. Confirm in Alert: "Record proof of delivery? OTP, rider confirmation, live GPS, accuracy, time, and note will be stored."
6. GPS captured automatically via `Geolocation.getCurrentPosition`

*Source: `RiderDeliveryOperationsScreen.tsx` lines 132-175 — `recordPod()` calls `deliveryOperationsService.completeDelivery()` with `{otpCode, proofType: 'CUSTOMER_OTP_PIN', riderConfirmed: true, latitude, longitude, accuracyMetres}`*

### Step G.6: Verify completion
1. Status → `DELIVERED`
2. `DeliveryProof` record with verification method, GPS, timestamps
3. Rider status → `ONLINE` (available for next order)
4. Dashboard shows "No active delivery"
5. Customer sees "Order delivered!"

---

## Admin Monitoring Pages

### Live Tracking Map (`/admin/live-tracking`)
- Leaflet map with all active deliveries
- Green markers = riders, Yellow = stores, Blue = delivery addresses
- Status filters: All Active, Rider Assigned, Out for Delivery, Stale Location (>6min)
- Real-time WebSocket updates via `adminRiderUpdate` events
- Click order → side panel with tracking state, ETA, distance, rider info

### Dispatch Board (`/admin/dispatch`)
- "Ready for pickup" orders with rider assignment dropdown
- Active deliveries list
- Rider availability (ONLINE/BUSY) with active order count

### Orders (`/admin/orders`)
- Full order management with status updates
- **"Reassign Rider"** button → opens modal → select rider → uses dispatch flow

### Riders (`/admin/riders`)
- Rider table with search, status filters
- **"Add Rider"** button → create form
- **"Live Global Map"** button → shows all riders on map
- Each rider row: view, delete actions

### Support (`/admin/support`)
- Post-delivery support tickets queue
- Shows order issues, refund requests, delivery complaints

---

## Status Transition Reference

```
WAITING_FOR_DISPATCH → [auto-dispatch] → RIDER_ASSIGNED
RIDER_ASSIGNED → [rider: "Start trip to store"] → RIDER_EN_ROUTE_TO_STORE
RIDER_EN_ROUTE_TO_STORE → [rider: "I arrived at store"] → RIDER_AT_STORE
RIDER_AT_STORE → [store: verify pickup] → PICKUP_VERIFIED
PICKUP_VERIFIED → [rider: "Start customer delivery"] → OUT_FOR_DELIVERY
OUT_FOR_DELIVERY → [rider: "I arrived at customer"] → RIDER_AT_CUSTOMER
RIDER_AT_CUSTOMER → [rider: OTP + POD] → DELIVERED
```

---

## UI Gaps Found

### Rider App
| Screen | Element | Status |
|--------|---------|--------|
| `RiderDashboard` | Offer countdown timer | ✅ |
| `RiderDashboard` | Accept/Reject buttons | ✅ |
| `RiderDashboard` | Active delivery card | ✅ |
| `RiderDashboard` | Tracking health panel | ✅ |
| `RiderDashboard` | Go Online/Offline toggle | ✅ |
| `RiderDeliveryOperationsScreen` | Issue customer OTP | ✅ |
| `RiderDeliveryOperationsScreen` | Enter OTP + record POD | ✅ |
| `RiderDeliveryOperationsScreen` | Delivery failure recording | ✅ |
| `RiderDeliveryOperationsScreen` | Return to store | ✅ |
| `PartnerNotificationsScreen` | "Rider arrived" → pickup verification | ✅ Fixed |

### Store App
| Screen | Element | Status |
|--------|---------|--------|
| `StoreDashboard` | Order counts, revenue, inbox badge | ✅ |
| `StoreOrdersScreen` | Order list with status chips | ✅ |
| `StoreOrderDetailsScreen` | Item list, status update | ✅ |
| `StorePickupVerificationScreen` | Issue PIN/QR, confirm handoff | ✅ |
| `StoreDeliveryOperationsScreen` | Returns, COD, pickup banner | ✅ |
| `PartnerNotificationsScreen` | "Rider arrived" → pickup verification | ✅ Fixed |

### Admin Dashboard (Web)
| Page | Element | Status |
|------|---------|--------|
| `/admin` | Dashboard with stats, trend, fulfillment | ✅ |
| `/admin/partner-applications` | Review workspace, approve/reject | ✅ |
| `/admin/dispatch` | Dispatch board with rider assignment | ✅ |
| `/admin/orders` | Order management, reassign rider | ✅ Fixed |
| `/admin/riders` | Add Rider, Live Global Map, table | ✅ |
| `/admin/stores` | Add Store with owner + map pin | ✅ |
| `/admin/live-tracking` | Real-time map, WebSocket updates | ✅ |
| `/admin/support` | Support ticket queue | ✅ |
| `/admin/products` | Product management | ✅ |
| `/admin/delivery-zones` | Delivery zone management | ✅ |
| `/admin/promotions` | Promotion management | ✅ |
| `/admin/delivery-exceptions` | Delivery exception handling | ✅ |
| `/admin/analytics` | Business analytics | ✅ |
| `/admin/notifications` | Notification management | ✅ |
| `/rider/delivery` | Rider delivery operations (web) | ✅ |
| `/rider/offers` | Rider offers (web) | ✅ |

### Customer App
| Screen | Element | Status |
|--------|---------|--------|
| `ShopScreen` | Browse products | ✅ |
| `CartScreen` | Cart management | ✅ |
| `CheckoutScreen` | Address, payment, coupon, place order | ✅ |
| `OrderDetailScreen` | Live tracking map, ETA, rider location | ✅ |
| `OrdersScreen` | Order history | ✅ |
| `NotificationsScreen` | Notification inbox | ✅ |
| `DealsScreen` | Deals/promotions | ✅ |

---

## Device Setup Checklist

| Device | Role | What to Test |
|--------|------|-------------|
| Mobile 1 | Customer | Place order, track, get OTP |
| Mobile 2 | Store Owner | Accept order, pack, verify pickup |
| Mobile 3 | Rider | Accept offer, travel, pickup, deliver |
| Browser | Admin | All admin pages, dispatch, tracking |
