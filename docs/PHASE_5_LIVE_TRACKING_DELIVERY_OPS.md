# Phase 5: Live Tracking & Delivery Operations

## Current Tracking Architecture

The tracking system uses a **dual-path architecture** combining REST API persistence with WebSocket real-time broadcasting:

1. **REST Path (Primary)**: Rider sends location via `POST /tracking/rider-location` → Service validates → Persists to `RiderLocationPing` table → Computes ETA → Broadcasts via socket
2. **Socket Path (Real-time)**: Rider also emits `updateRiderLocation` via socket → Gateway broadcasts to relevant rooms

## Event Names

| Event | Direction | Room | Payload |
|-------|-----------|------|---------|
| `joinOrder` | Client → Server | `order_{orderId}` | `{ orderId }` |
| `joinAdminMonitor` | Client → Server | `admin_monitor` | - |
| `joinAdminOrders` | Client → Server | `admin_orders` | - |
| `riderLocationUpdated` | Server → Client (volatile) | `order_{orderId}`, `admin_monitor` | `{ orderId, riderId, latitude, longitude, etaMinutes, distanceKm, trackingState, isStale }` |
| `riderMoved` | Server → Client (volatile) | `order_{orderId}` | Same as above |
| `adminRiderUpdate` | Server → Client (volatile) | `admin_monitor` | Same as above |
| `orderStatusUpdated` | Server → Client | `order_{orderId}`, `admin_orders`, `admin_monitor` | `{ orderId, status, ... }` |
| `orderTimelineUpdated` | Server → Client | `order_{orderId}`, `admin_monitor` | `{ order, timeline, ... }` |
| `trackingStopped` | Server → Client | `order_{orderId}`, `admin_monitor` | `{ orderId, status, stoppedAt }` |
| `riderAssigned` | Server → Client | `order_{orderId}`, `admin_monitor` | `{ orderId, rider }` |

## REST Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/tracking/order/:orderId` | Admin/Rider/Store Owner | Get order tracking with ETA, route, rider location |
| `GET` | `/tracking/my/order/:orderId` | Customer | Get own order tracking (access-controlled) |
| `GET` | `/tracking/admin/live` | Admin | Get all active orders with riders |
| `POST` | `/tracking/rider-location` | Rider | Ingest rider location ping |
| `POST` | `/tracking/start/:orderId` | Rider | Start tracking (OUT_FOR_DELIVERY) |
| `POST` | `/tracking/stop/:orderId` | Rider | Stop tracking (DELIVERED) |

## Socket Rooms

| Room | Access | Purpose |
|------|--------|---------|
| `order_{orderId}` | Customer (own order), Rider (assigned), Store Owner (own store), Admin | Order-specific tracking updates |
| `admin_monitor` | Admin only | All active rider/order updates |
| `admin_orders` | Admin only | Order status notifications |
| `riders_queue` | Rider | New order queue |
| `zone_{lat}_{lng}` | Rider | Zone-based order notifications |

## Security Model

### Socket Authentication
- All socket connections require JWT token validation
- Token extracted from `auth.token`, `Authorization` header, or `access_token` cookie
- Unauthenticated connections are rejected

### Room-Level Access Control
- **joinOrder**: Customer can only join own order, Rider only assigned order, Store Owner only own store's orders, Admin any order
- **joinAdminMonitor**: Admin role required
- **joinAdminOrders**: Admin role required
- **updateRiderLocation**: Rider role required, must be assigned to order, order must be in trackable status

### Validation
- **Rider ownership**: Rider can only send location for orders assigned to them
- **Status validation**: Location only accepted for `RIDER_ASSIGNED` or `OUT_FOR_DELIVERY` orders
- **Jump detection**: Implied speed > 140 km/h rejected
- **Customer access**: Customer cannot access another customer's tracking data

## Tracking State Model

```
NOT_ASSIGNED → ASSIGNED_NO_LOCATION → LIVE ↔ STALE → STOPPED/DELIVERED/CANCELLED
```

| State | Description |
|-------|-------------|
| `NOT_ASSIGNED` | Order has no rider assigned |
| `ASSIGNED_NO_LOCATION` | Rider assigned but no location pings yet |
| `LIVE` | Active location pings within stale threshold |
| `STALE` | Last ping older than `staleAfterSeconds` (360s) |
| `STOPPED` | Tracking stopped (order completed/cancelled) |
| `DELIVERED` | Order delivered |
| `CANCELLED` | Order cancelled |

## Customer Flow

1. Customer opens order detail → Fetches tracking via `GET /tracking/my/order/:orderId`
2. Joins `order_{orderId}` socket room
3. Receives `riderLocationUpdated` events with live rider position
4. Map shows store (orange), delivery (blue), rider (green) markers
5. Displays ETA, distance remaining, last update time
6. Falls back to polling every 10s if socket disconnects

## Rider Flow

1. Rider goes online → Requests GPS permission
2. Accepts order → Order status transitions to `RIDER_ASSIGNED`
3. Starts tracking → Status transitions to `OUT_FOR_DELIVERY`
4. Sends location pings every 8s (OUT_FOR_DELIVERY) or 20s (RIDER_ASSIGNED)
5. Each ping validated server-side for ownership, status, and jump detection
6. Tracking status shown: waiting → sending → live → failed
7. Retries failed pings once after 3 seconds
8. Stops sending after delivery/cancellation

## Admin Flow

1. Admin navigates to Live Tracking page → Fetches `GET /tracking/admin/live`
2. Joins `admin_monitor` socket room
3. Sees all active orders on map with rider positions
4. Can filter by status (ALL, RIDER_ASSIGNED, OUT_FOR_DELIVERY, STALE)
5. Clicks order → Detail drawer with customer/store/rider info, ETA, distance
6. Stale locations highlighted with red indicator

## ETA Computation Algorithm

1. Get latest `RiderLocationPing` for the order
2. Check if ping is stale (> 6 minutes old) → return null ETA
3. Compute haversine distance from rider to `order.deliveryLat/deliveryLng`
4. Estimate speed:
   - If GPS speed available: clamp to 8-48 km/h range
   - Otherwise: default to 18 km/h (typical urban delivery)
5. ETA = distance / speed × 60 (minutes), minimum 2 minutes
6. Confidence: HIGH (GPS speed), MEDIUM (default speed), LOW (no data)

## Stale Detection

- **Threshold**: 360 seconds (6 minutes)
- **Check**: `Date.now() - lastPingAt > staleAfterSeconds * 1000`
- **Effect**: `trackingState` becomes `STALE`, `isStale: true`, ETA returns null

## Jump Detection

- Compute implied speed from consecutive pings using haversine distance and time difference
- If implied speed > 140 km/h: reject ping with "Location jump is too large"
- Prevents GPS glitches from corrupting tracking data

## Limitations

1. **No background tracking**: Location only sent when app is in foreground. Native background tracking requires platform-specific setup (not implemented).
2. **No offline maps**: Maps require internet connection.
3. **No push notifications for tracking events**: FCM push exists but tracking-specific push not implemented.
4. **No real-time ETA countdown**: ETA is computed on each ping, not continuously updated client-side.
5. **Zone-based dispatch**: Zone rooms exist but no server-side zone matching logic.

## Future Background Tracking Plan

1. **Android**: Use `react-native-background-geolocation` with foreground service
2. **iOS**: Use `react-native-background-geolocation` with UIBackgroundModes
3. **Strategy**: Send location every 30s in background, 8s in foreground
4. **Battery**: Implement adaptive interval based on movement detection
5. **Privacy**: Only track during active delivery, stop immediately on completion
