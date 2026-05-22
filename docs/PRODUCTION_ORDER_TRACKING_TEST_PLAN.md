# Production Order Tracking Test Plan

## Goal
Validate the complete production journey: customer places an order, rider goes online automatically after location permission, rider accepts/picks the order, and customer/admin/rider all see consistent status, live location, and ETA-ready tracking data.

## Preconditions
- API and web are deployed on Railway.
- Mobile APK points to `https://aagam-api-production.up.railway.app`.
- Customer and rider accounts can log in on separate devices or one device plus web.
- The rider device has Location enabled and app location permission allowed.
- At least one store has valid latitude/longitude and active inventory for the ordered products.
- Customer has a saved delivery address with latitude/longitude pinned from live location or map.

## Test Flow
1. Customer address setup
- Open web `/shop/addresses` or mobile Profile.
- Add an address using either current location or map pin.
- Confirm the saved address has real latitude and longitude.

2. Customer order placement
- Open customer shop.
- Confirm products render in two columns with real images.
- Add two or more items to cart.
- Place an order with COD first, then repeat later with online simulated payment.
- Confirm order moves to `CONFIRMED` and appears in customer order history.

3. Rider availability
- Log in to mobile as rider.
- Allow location permission.
- Rider should become `ONLINE` automatically without pressing the online button.
- Confirm the available order queue loads.
- Admin Riders page should show the rider online with latest coordinates.

4. Rider pickup and delivery
- Rider accepts the available order.
- Confirm order becomes assigned to that rider.
- Rider taps through the lifecycle:
- `RIDER_ASSIGNED` -> start live delivery.
- `OUT_FOR_DELIVERY` -> complete delivery.
- Confirm rider location pings are sent while order is active.

5. Customer tracking
- Open the customer order detail page.
- Confirm delivery status, rider assignment, and latest live location are visible.
- Confirm ETA-ready fields are available from tracking response.
- If ETA is not calculated yet, record it as next enhancement: distance + speed based estimate.

6. Admin tracking
- Open Admin Orders and Admin Riders.
- Confirm order status updates in near real time.
- Confirm rider map/location reflects latest rider coordinates.
- Confirm delivered order ends live tracking and does not keep sending pings.

## Expected Results
- Product cards show two per row on web and mobile.
- Address can be pinned by current location or map on web and mobile.
- Rider does not need to manually press online after granting permission.
- Rider login does not crash the production APK.
- Customer, rider, and admin see consistent order status.
- Tracking has rider coordinates and is ready for ETA calculation.

## Next Professional Enhancements
- Add server-side ETA calculation using store, rider, and customer coordinates.
- Add route distance through a maps/directions provider instead of straight-line distance.
- Add foreground location service for reliable background tracking during delivery.
- Add rider battery/network diagnostics for missed pings.
- Add customer-facing map visualization in mobile order detail.
- Add admin audit log for rider assignment and status transitions.
