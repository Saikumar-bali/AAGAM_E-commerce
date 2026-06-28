# Phase 4 - UI/API Integration Polish

**Date:** 2026-06-28
**Branch:** `phase-4-ui-api-integration-polish`
**Base SHA:** 0caecd1 (Phase 3 final)
**Result:** 72 tests pass (43 order + 29 inventory/payments), build OK

## Changes Made

### FIX 1: Store Owner Orders Page
**File:** `apps/admin-dashboard/src/app/(store)/store/orders/page.tsx`

- Replaced `/stores/my-stores` API fetch with `/orders/store` (GET /orders/store)
- Added typed API response matching backend shape (items, payment, rider)
- Added status action buttons: Confirm, Start Picking, Mark Packed, Cancel
- Shows backend error messages per-action inline
- Shows rider name and payment info on each order card
- Added missing statuses: PAYMENT_PENDING, PACKED, RIDER_ASSIGNED

### FIX 2: Admin Orders Page
**File:** `apps/admin-dashboard/src/app/(admin)/admin/orders/page.tsx`

- Added `PACKED` and `RIDER_ASSIGNED` to statusOptions and getStatusConfig
- Added Force Cancel modal with reason textarea (PATCH /orders/:id/force-cancel)
- Added Reassign Rider modal with rider dropdown (fetches GET /riders, POST /orders/:id/reassign-rider)
- Fixed duplicate `₹` symbol in amount column
- Only shows Force Cancel for non-cancelled/non-delivered orders

### FIX 3: Rider Web Dashboard
**File:** `apps/admin-dashboard/src/app/(rider)/rider/page.tsx`

- Fixed status transitions to match backend state machine:
  - Removed CONFIRMED → PICKING (store owner action, not rider)
  - RIDER_ASSIGNED → OUT_FOR_DELIVERY via handleStartDelivery
  - OUT_FOR_DELIVERY → DELIVERED via handleDelivered
- Added missing statuses: PAYMENT_PENDING, PACKED, RIDER_ASSIGNED
- Updated instructions and action buttons for correct flow

### FIX 4: Rider Mobile Status Flow
**File:** `apps/mobile-partners/src/screens/rider/RiderDashboard.tsx`

- Fixed `handleUpdateStatus`:
  - RIDER_ASSIGNED → OUT_FOR_DELIVERY via updateOrderStatus API (was incorrectly calling startTracking only)
  - OUT_FOR_DELIVERY → DELIVERED via updateOrderStatus API (was incorrectly calling stopTracking only)
- Updated `getActionLabel` to show correct labels ("Start Delivery", "Mark Delivered")
- Removed CONFIRMED/PICKING/PACKED transitions (store owner actions)

## Verification
- `apps/admin-dashboard`: `next build` - success (all routes compiled, no errors)
- `apps/api-gateway`: `jest --runInBand --testPathPattern "(inventory|payments|orders)"` - 72/72 passed
- No schema changes required
