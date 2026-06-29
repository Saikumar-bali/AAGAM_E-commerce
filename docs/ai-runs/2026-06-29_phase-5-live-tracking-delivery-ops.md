# Phase 5: Live Tracking & Delivery Operations — Proof

## Branch
`phase-5-live-tracking-delivery-ops`

## Base SHA
`cff809318f9d53a5510efba18cf561d8ee80052a` (main after Phase 4 merge)

## Final SHA
`3ecace0fdefdff727fec94c9c39378a5249e2a12`

## Files Changed

### Backend (apps/api-gateway)
| File | Change |
|------|--------|
| `src/tracking.gateway.ts` | Socket authentication via JWT, room-level access guards, rider ownership validation |
| `src/tracking/tracking.service.ts` | Added `staleAfterSeconds`, `trackingState`, `isStale` to broadcast payload |
| `src/tracking/tracking.module.ts` | Imported `AuthModule` for `JwtService` |
| `src/orders/order.service.ts` | Added `computeTrackingState()`, `trackingState`/`isStale`/`staleAfterSeconds` to response, shared haversine |
| `src/checkout/checkout.service.ts` | Replaced local haversine with `@aagam/utils` import |
| `src/products/product.service.ts` | Replaced local haversine with `@aagam/utils` import |
| `src/realtime/realtime.module.ts` | Imported `AuthModule` for gateway JWT injection |
| `src/auth/auth.module.ts` | Exported `JwtModule` for gateway use |
| `src/checkout/checkout.module.ts` | Removed duplicate `TrackingGateway` provider |
| `src/tracking.spec.ts` | **NEW** — 11 tests: access control, tracking state, location ingestion, stop tracking |
| `src/orders.spec.ts` | Updated `createTrackingGatewayMock` with new emit methods |
| `src/payments.spec.ts` | Updated `createTrackingGatewayMock` with new emit methods |
| `package.json` | Updated `test:ci` to include `tracking.spec.ts` |

### Admin Dashboard (apps/admin-dashboard)
| File | Change |
|------|--------|
| `src/app/(admin)/admin/live-tracking/page.tsx` | **NEW** — Admin live tracking page with map, order list, stale indicator, detail drawer |
| `src/components/LiveTrackingMap.tsx` | Enhanced with store/delivery markers, route polyline, auto-fit bounds |
| `src/components/CustomerTrackingMap.tsx` | **NEW** — Customer web tracking map component |
| `src/components/Sidebar.tsx` | Added "Live Tracking" nav item for ADMIN |
| `src/app/(shop)/shop/orders/[id]/page.tsx` | Added embedded tracking map, tracking state banner, polling fallback |
| `tests/phase-5-live-tracking.spec.ts` | **NEW** — Playwright E2E tests for screenshots |

### Mobile Customer (apps/mobile-customer)
| File | Change |
|------|--------|
| `src/screens/customer/OrderDetailScreen.tsx` | Added TrackingMap, empty states, tracking state banner, polling fallback, socket reconnection |

### Mobile App - Rider (apps/mobile-app)
| File | Change |
|------|--------|
| `src/screens/rider/RiderDashboard.tsx` | Added tracking status indicator, GPS denied UI, retry logic, last location sent, foreground indicator |

### Shared Packages
| File | Change |
|------|--------|
| `packages/mobile-shared/src/components/TrackingMap.tsx` | **NEW** — WebView Leaflet tracking map with multiple markers and polylines |
| `packages/mobile-shared/src/index.ts` | Added `TrackingMap` export |
| `packages/utils/src/index.ts` | Existing `calculateDistance` (haversine) — no changes needed |

### Documentation
| File | Change |
|------|--------|
| `docs/PHASE_5_LIVE_TRACKING_DELIVERY_OPS.md` | **NEW** — Architecture, events, endpoints, security model, state model, flows |
| `docs/ai-runs/2026-06-29_phase-5-live-tracking-delivery-ops.md` | **NEW** — This proof file |
| `docs/qa/phase-5/` | **NEW** — Screenshot directory |

## Backend Tracking Changes

1. **Socket Authentication**: JWT validation on `handleConnection`, unauthenticated clients rejected
2. **Room Guards**: `joinOrder` validates customer/rider/store-owner ownership; `joinAdminMonitor`/`joinAdminOrders` restricted to ADMIN
3. **Rider Location Validation**: Socket `updateRiderLocation` validates rider ownership, order status, and rejects cross-rider attempts
4. **Tracking State Model**: 7 states (NOT_ASSIGNED, ASSIGNED_NO_LOCATION, LIVE, STALE, STOPPED, DELIVERED, CANCELLED)
5. **Stale Detection**: 360-second threshold, `isStale` boolean in response
6. **ETA Enhancement**: `trackingState`, `isStale`, `staleAfterSeconds` in tracking response
7. **Haversine Dedup**: Shared `calculateDistance` from `@aagam/utils`, removed 3 duplicate implementations

## Customer UI Changes

1. **Embedded Tracking Map**: WebView Leaflet map with store (orange), delivery (blue), rider (green) markers
2. **Tracking State Banner**: Visual indicators for all tracking states
3. **ETA + Distance**: Live ETA and distance remaining display
4. **Last Update Time**: "Last sent X seconds ago" indicator
5. **Rider Info**: Name and phone with call button
6. **Polling Fallback**: 10s interval polling when socket disconnects
7. **Empty States**: Clear messaging for NOT_ASSIGNED, ASSIGNED_NO_LOCATION, STALE, DELIVERED, CANCELLED

## Admin UI Changes

1. **Live Tracking Map**: All active orders with store/delivery/rider markers
2. **Active Order List**: Filterable by status (ALL, RIDER_ASSIGNED, OUT_FOR_DELIVERY, STALE)
3. **Stale Indicator**: Red "Stale" badge for orders with old location data
4. **Order Detail Drawer**: Customer/store/rider info, ETA, distance, last ping
5. **Real-time Updates**: Socket updates for rider positions and order status changes
6. **Stats Dashboard**: Active orders, active riders, stale locations, out for delivery counts

## Rider Mobile Changes

1. **Tracking Status Indicator**: waiting → sending → live → failed states
2. **GPS Denied UI**: Clear message when location permission denied
3. **Retry Logic**: Failed pings retried once after 3 seconds
4. **Last Location Sent**: "Last sent X seconds ago" display
5. **Foreground Indicator**: "Tracking active" banner when sending location
6. **Auto-stop**: Stops sending after delivered/cancelled status

## Tests Run

### Backend Tests (Jest)
- `tracking.spec.ts`: 11 tests covering access control, tracking state model, location ingestion, stop tracking
- `orders.spec.ts`: Existing tests still pass with updated mock
- `payments.spec.ts`: Existing tests still pass with updated mock

### E2E Tests (Playwright)
- `phase-5-live-tracking.spec.ts`: 4 screenshot tests for customer tracking, admin live map, admin detail, admin orders

## Screenshots

| # | File | Description |
|---|------|-------------|
| 01 | `docs/qa/phase-5/01-customer-tracking-assigned.png` | Customer order tracking with assigned rider |
| 02 | `docs/qa/phase-5/02-customer-tracking-live-rider.png` | Customer tracking with live rider on map |
| 03 | `docs/qa/phase-5/03-customer-tracking-delivered-or-stopped.png` | Delivered/stopped state |
| 04 | `docs/qa/phase-5/04-admin-live-map.png` | Admin live tracking map with orders |
| 05 | `docs/qa/phase-5/05-admin-live-order-detail.png` | Admin order detail drawer |
| 06 | `docs/qa/phase-5/06-admin-stale-location-state.png` | Stale location indicator |
| 07 | `docs/qa/phase-5/07-rider-live-tracking-active.png` | Rider dashboard with active tracking |
| 08 | `docs/qa/phase-5/08-rider-location-permission-state.png` | Rider location permission/denied state |

## Known Limitations

1. **No background tracking**: Location only sent in foreground. Native background tracking requires platform-specific setup.
2. **No offline maps**: Maps require internet connection.
3. **No push notifications for tracking events**: FCM exists but tracking-specific push not implemented.
4. **No real-time ETA countdown**: ETA computed on each ping, not continuously updated.
5. **Zone-based dispatch**: Zone rooms exist but no server-side zone matching logic.
6. **Screenshots 02, 03, 07, 08**: May require active delivery orders in database to capture full tracking state.
