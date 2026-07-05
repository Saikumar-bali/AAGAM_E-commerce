# AAGAM Customer Mobile App — End-to-End Completion Plan

**Date:** 2026-07-05  
**Scope:** `apps/mobile-customer` customer app only, with minimal shared-package/API changes when required.  
**Out of scope for this track:** partner/admin/rider app feature work, production deployment, and unrelated web UI changes.

## Current architecture snapshot

- Customer app path: `apps/mobile-customer`.
- Partner/admin/rider app path: `apps/mobile-partners`.
- Legacy combined app path: `apps/mobile-app` should be treated as reference only unless a proven fix must be ported.
- Shared mobile code path: `packages/mobile-shared`.
- Customer app already has:
  - auth routing and CUSTOMER-only guard
  - login/signup screens
  - shop/search/category/sort/product detail
  - Zustand persisted cart
  - checkout quote/place-order integration
  - saved address creation with map/current-location support
  - order list/detail
  - live tracking map/socket/polling support

## Senior architecture rule

Complete this phase-by-phase. Do not let CLI-AI randomly patch everything. Each phase must finish with code, local proof, screenshots/logs, and a short markdown report before moving to the next phase.

## Phase CM-0 — Baseline verification and repo hygiene

**Goal:** Prove the current customer app can run locally against the API before adding features.

### Must do

1. Create a branch from latest `main`:
   - `feature/customer-mobile-cm-0-baseline`
2. Confirm repo status is clean before starting.
3. Verify app/environment config:
   - `apps/mobile-customer/.env`
   - `API_URL`
   - `GOOGLE_WEB_CLIENT_ID`
4. Run:
   - `npm install`
   - `npm run build:api`
   - `npx tsc --noEmit -p packages/mobile-shared/tsconfig.json`
   - `npx tsc --noEmit -p apps/mobile-customer/tsconfig.json`
   - `cd apps/mobile-customer/android && ./gradlew assembleDebug` on Linux/macOS, or `gradlew.bat assembleDebug` on Windows.
5. Launch app on emulator/device.
6. Capture proof for:
   - login screen
   - signup screen
   - customer login success
   - shop screen loads products
   - cart add/remove works
   - profile screen loads saved addresses or empty state

### Acceptance

- App builds or every blocker is documented with exact command, error, file, and suggested fix.
- No direct commit to `main`.
- No partner app changes.

---

## Phase CM-1 — Auth and onboarding completion

**Goal:** Make signup/login reliable from first install to authenticated customer session.

### Required fixes

1. Signup must send phone if backend supports it, or clearly remove the phone field until backend supports it. The current UI collects phone but the signup action only sends name/email/password/role.
2. Add strong validation:
   - name required
   - valid email
   - password minimum length
   - phone optional or valid 10-digit/+91 format
3. Show useful backend errors without crashing.
4. Add password visibility toggle.
5. Add clear loading states.
6. Confirm Keychain session restore works after app restart.
7. Confirm wrong-role login shows blocked message and does not enter customer tabs.
8. Logout clears token and cart if the product decision is to isolate cart per user.

### Acceptance

- Fresh signup lands in customer app.
- Existing customer login works.
- Wrong role is blocked.
- Restart keeps valid session.
- Logout returns to login.

---

## Phase CM-2 — Customer home/catalog/product discovery

**Goal:** Make product browsing feel like a quick-commerce customer app, not only a raw product grid.

### Required features

1. Add customer home header:
   - selected delivery address/location summary
   - serviceability hint
   - search input
   - category carousel
2. Add search debounce to avoid API call on every keystroke.
3. Add skeleton loaders, retry and offline-friendly error states.
4. Product cards must show:
   - image fallback
   - category
   - name
   - price
   - stock status
   - quantity stepper if already in cart
5. Product detail must show:
   - quantity stepper
   - product image fallback
   - stock/store availability
   - add-to-cart confirmation
6. Keep API contract aligned with `/products`, `/products/categories`, and `/products/:id`.

### Acceptance

- Search/category/sort all work together.
- Product detail add-to-cart updates cart badge.
- Out-of-stock products cannot be added.

---

## Phase CM-3 — Cart and checkout reliability

**Goal:** Prevent duplicate/invalid orders and make pricing trustworthy.

### Required features

1. Cart quantity stepper must enforce:
   - quantity >= 1
   - max quantity from quote/availability when known
2. Add price summary:
   - subtotal
   - delivery fee
   - discount placeholder if backend adds it later
   - tax placeholder if backend adds it later
   - grand total
3. Checkout must request quote whenever items/address changes.
4. Place-order must include an `Idempotency-Key` header generated per checkout attempt and reused only while the same request is pending.
5. Disable order button while placing order.
6. On out-of-stock response, show product-specific error and keep cart intact.
7. On serviceability failure, guide user to edit/add another address.
8. After success, clear cart and navigate to order detail.

### Acceptance

- Double tapping order button does not create duplicate orders.
- Quote values match order values.
- Out-of-stock item blocks checkout with clear message.
- COD order is created and visible in Orders.

---

## Phase CM-4 — Address book and serviceability

**Goal:** Customer can add, edit, delete, select, and validate delivery addresses without leaving checkout confused.

### Required features

1. Add address form validation:
   - recipient name
   - phone
   - line1
   - city/state/pincode
   - latitude/longitude
2. Support address edit, delete, and set default from mobile UI.
3. Checkout should allow add/edit address directly, not only instruct user to go to Profile.
4. Add serviceability preview after address selection.
5. Reverse geocode should not silently fail without user feedback.
6. Store selected address in a small customer preference store if needed.

### Acceptance

- Add address works.
- Edit address works.
- Delete address works.
- Default address affects checkout preselection.
- Outside-radius address disables checkout with explanation.

---

## Phase CM-5 — Order history and lifecycle clarity

**Goal:** Customer can understand every stage from order placed to delivered/cancelled.

### Required features

1. Orders screen should show status chips with human-readable labels.
2. Add pull-to-refresh and empty state already exists; improve error state.
3. Order detail should show:
   - short order ID
   - status timeline
   - store name
   - item summary
   - address snapshot
   - payment method/status
   - total breakup
4. Add customer cancel request only if backend supports allowed status transitions. If backend does not support it, document as deferred.
5. Handle payment pending vs COD clearly.

### Acceptance

- Newly placed order appears in list.
- Order detail always loads from list and after checkout.
- Status changes are visible after refresh/realtime event.

---

## Phase CM-6 — Live tracking and notifications

**Goal:** Customer receives meaningful live delivery updates after rider assignment.

### Required features

1. Verify socket connection uses the same API base URL as the app.
2. Keep existing `joinOrder` flow and polling fallback.
3. Add clear states:
   - waiting for store acceptance
   - preparing
   - packed
   - waiting for rider
   - rider assigned
   - picked up
   - live location
   - stale location
   - delivered
   - cancelled
4. Register customer FCM token after login if backend supports device-token registration.
5. Show foreground notification/toast for order status updates.
6. Do not require Google Maps paid key; Leaflet/OpenStreetMap fallback is acceptable.

### Acceptance

- Customer order detail receives realtime/polling updates.
- Stale tracking does not crash.
- Rider call button works when phone is available.

---

## Phase CM-7 — UX polish and quick-commerce quality

**Goal:** Make the customer app feel complete enough for user testing.

### Required polish

1. Consistent AAGAM theme across screens.
2. Safe area and keyboard handling.
3. Empty states for products, cart, orders, addresses.
4. Error states with retry actions.
5. Toast confirmations for add-to-cart/address/order actions.
6. Accessibility labels for main actions.
7. Keep performance safe for low-end Android devices.

### Acceptance

- No obvious overlapping UI on common Android resolutions.
- User can complete order without instructions from developer.

---

## Phase CM-8 — Local QA pack and release readiness

**Goal:** Give owner a reliable local testing checklist and release APK proof.

### Required outputs

1. Add `docs/qa/customer-mobile/manual-test-cases.md`.
2. Add `docs/qa/customer-mobile/api-smoke-curl.md`.
3. Add `docs/qa/customer-mobile/proof.md` after testing.
4. Build debug APK and, when ready, release APK.
5. Capture screenshots/logs for every critical flow.

### Acceptance

- Manual test cases pass.
- API smoke tests pass.
- Android build passes.
- No blocker remains undocumented.

---

## Phase discipline

Every phase report must include:

```md
# AI Run: <phase name>

## Branch
<branch>

## Commit
<sha>

## Files changed
- ...

## What changed
- ...

## Proof commands
```bash
...
```

## Proof results
- PASS/FAIL with exact evidence

## Screenshots/videos requested from local tester
- ...

## Known issues / deferred
- ...
```

## Do not accept from CLI-AI

Reject the phase if CLI-AI says "done" without:

- branch name
- commit SHA
- changed files list
- command outputs
- screenshots/logcat notes for mobile runtime
- exact failed command if anything failed
- no direct push to `main`
