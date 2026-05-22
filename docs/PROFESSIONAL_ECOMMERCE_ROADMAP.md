# Aagam Professional Ecommerce Roadmap

## 1. Current Diagnosis

The product is a hybrid quick-commerce and ecommerce platform. The strongest direction is similar to Blinkit, Instamart, Zepto, BigBasket Now, or local-store ecommerce: customers shop from nearby stores, inventory is store-aware, riders fulfill orders, and admins operate the marketplace.

The mobile debug app can work while the release APK crashes because debug uses Metro live JavaScript, but release APK ships a bundled Hermes JavaScript file inside the APK. A release-only crash usually comes from one of these:

- Metro bundles a different dependency tree than debug.
- A monorepo resolves the wrong package version during release bundling.
- Stale release bundle or stale Gradle build output is installed.
- Release config uses different environment variables.
- Hermes exposes runtime errors that are hidden or delayed in debug.
- Missing native module setup only appears in release.

The current concrete release risk was React resolution. The repo root has React 18 for web/admin, while the mobile app needs React 19 for React Native 0.85.x. Metro must force mobile bundles to use `apps/mobile-app/node_modules/react`.

The current image issue is seed data. Products such as banana, curd, eggs, and onions existed without `image` values, so customer clients showed fallback placeholders. Seed data should update existing product rows with demo image URLs, and production should later use real product images uploaded to object storage/CDN.

## 2. Guiding Principles

- Stabilize checkout, inventory, order lifecycle, and mobile release builds before adding marketplace-scale features.
- Keep quick-commerce first: store-aware inventory, fast delivery, rider tracking, and live order state matter more than Amazon-style marketplace breadth.
- Build every feature with customer, admin, rider, and operations impact in mind.
- Prefer shared contracts for enums and DTOs so web, mobile, and backend do not drift.
- Treat inventory as money: every stock movement needs a reason, actor, timestamp, and audit trail.
- Treat releases like production: local debug success is not enough; release APK and deployed API must be tested together.

## 3. Phase 1: Release Stability And Core Reliability

### Mobile Release Stability

- Force Metro to resolve mobile React from `apps/mobile-app/node_modules/react`.
- Keep root React 18 for web/admin and mobile React 19 for React Native.
- Add a CI check that builds a production bundle and fails if root `node_modules/react/cjs/react.production.min.js` appears in the mobile sourcemap.
- Add a clean local release test script for `assembleRelease`, install, launch, and logcat capture.
- Add release environment validation so APK never points to localhost.
- Add app version/build number display in a hidden debug/about screen.

### Checkout Reliability

- Keep inventory decrement inside the checkout transaction.
- Prevent oversell using atomic update conditions.
- Validate store serviceability before quote and before order placement.
- Add idempotency keys for all order placement requests.
- Ensure failed payments cannot leave orders in a stuck state.
- Add checkout tests for out-of-stock, concurrent order, non-serviceable address, COD, and online payment.

### Shared Contracts

- Move payment methods, order statuses, rider statuses, and address DTOs into shared packages.
- Generate or manually enforce client/backend contract tests.
- Make backend reject unknown enum values instead of accepting free-form strings.

## 4. Phase 2: Customer App Features

### Discovery

- Home page with location selector, delivery ETA, active store, hero banners, category rail, featured products, deals, repeat purchases, and trending near you.
- Category pages with filters, sorting, pagination, and stock-aware availability.
- Search with suggestions, recent searches, popular searches, typo tolerance, and empty-state recommendations.
- Product detail screen with images, price, unit, description, category, stock status, delivery eligibility, ratings, reviews, and similar products.

### Cart

- Store-aware cart validation.
- Stock warnings before checkout.
- Quantity stepper with max quantity per item.
- Substitute suggestions for out-of-stock products.
- Cart item price snapshot and changed-price warnings.
- Clear delivery fee, taxes, discounts, packaging fee, and final payable total.

### Address And Serviceability

- Add, edit, delete, and set default address.
- Map picker with reverse geocoding later.
- Pincode and distance-based serviceability checks.
- Delivery instructions and landmark support.
- Saved address labels: Home, Work, Other.

### Checkout And Payment

- Quote screen before order placement.
- COD and online payment modes using one canonical backend enum.
- Coupon entry and validation.
- Order confirmation screen with ETA.
- Retry failed payment.
- Cancel eligible orders before cutoff.

### Orders And Tracking

- Order history with filters.
- Order detail with item snapshots, payment status, delivery address, rider details, support actions, and invoice-ready totals.
- Live status timeline: Placed, Confirmed, Picking, Packed, Rider Assigned, Out For Delivery, Delivered.
- Live rider map after rider assignment.
- Push notifications and in-app notifications for status changes.
- Reorder from past orders.

### Account

- Profile management.
- Saved addresses.
- Wishlist/favorites.
- Payment history.
- Help/support tickets.
- Notification preferences.
- Logout and account deletion request flow.

## 5. Phase 3: Rider App Features

### Rider Availability

- Online/offline toggle.
- Duty session start/end.
- Battery/network permission checks.
- Location permission health screen.
- Admin-visible rider availability.

### Assignment

- New order assignment screen.
- Accept/reject with timeout.
- Auto-assignment rules later: nearest rider, least active load, store proximity, rating, shift status.
- Manual admin assignment override.

### Fulfillment Flow

- Pickup task details: store, items count, customer address, payment method.
- Status actions: Arrived at Store, Picked Up, Out For Delivery, Arrived at Customer, Delivered.
- OTP or PIN delivery confirmation.
- Failed delivery reasons.
- COD collection confirmation.
- Proof of delivery photo later.

### Live Location

- Foreground location tracking while assigned.
- Background tracking only during active delivery.
- Send lat/lng/accuracy/speed/heading every configured interval.
- Throttle location pings to protect battery.
- Store location history by order for audit.
- Stop tracking automatically after delivery/cancellation.

### Rider Earnings

- Daily completed orders.
- Distance estimate.
- Incentives later.
- COD collected and settlement status.

## 6. Phase 4: Admin And Operations

### Dashboard

- Today orders, revenue, active stores, active riders, pending orders, delayed orders, low-stock products.
- Live operations board grouped by order status.
- Fulfillment SLA indicators.
- Payment mix and failure rate.

### Product Management

- Create/edit products.
- Category assignment.
- Image upload to R2/S3/CDN.
- Product active/inactive state.
- Product variants later: size, pack, weight, flavor.
- SEO/display metadata for web.

### Inventory Management

- Store-level stock.
- Low-stock thresholds.
- Stock adjustment with reason: purchase, damage, return, correction, transfer, order reserve, order cancel restore.
- Inventory ledger table for every stock movement.
- Reserved stock vs available stock.
- Batch/expiry support for grocery and dairy.
- Bulk upload/import from CSV.
- Inventory audit report.

### Store Management

- Store profile, address, geofence, delivery radius.
- Opening hours and temporary closure.
- Store owner assignment.
- Store-level order capacity.
- Serviceability controls by area/pincode.

### Order Operations

- Search/filter orders by status, customer, store, rider, payment, date.
- Manual status actions restricted by role.
- Cancellation with reason.
- Refund workflow later.
- Rider reassignment.
- Delay/escalation flags.
- Customer support notes.

### Rider Operations

- Rider onboarding.
- Document verification later.
- Live rider map.
- Shift and availability.
- Performance metrics: acceptance rate, delivery time, cancellation rate.

## 7. Phase 5: Professional Inventory Model

### Required Concepts

- `InventoryItem`: current stock per store/product/variant.
- `InventoryLedger`: append-only stock movements.
- `StockReservation`: temporary hold during checkout/payment.
- `Supplier`: source of goods.
- `PurchaseOrder`: restocking workflow.
- `GoodsReceipt`: stock received into a store.
- `StockTransfer`: movement between stores.
- `Batch`: expiry/manufacturing tracking for dairy, eggs, packaged goods.
- `LowStockRule`: threshold and reorder point.

### Important Stock States

- On hand: physically present.
- Reserved: promised to pending orders.
- Available: on hand minus reserved.
- Damaged: not sellable.
- Expired: not sellable.
- In transit: moving between supplier/store.

### Stock Movement Reasons

- Initial stock.
- Purchase receipt.
- Manual correction.
- Order reservation.
- Order confirmation decrement.
- Order cancellation restore.
- Damage/write-off.
- Expiry/write-off.
- Store transfer out.
- Store transfer in.

## 8. Phase 6: Ecommerce Replica Features

- Wishlist/favorites.
- Ratings and reviews gated by delivered orders.
- Coupons and promotions.
- Referral system.
- Wallet/store credits later.
- Repeat purchase recommendations.
- Bundles and combo offers.
- Recently viewed products.
- Back-in-stock alerts.
- Product substitutions.
- Scheduled delivery slots.
- Loyalty tiers later.

## 9. Phase 7: Production Testing Plan

### Local Debug

- Run Metro with reset cache.
- Run Android debug build.
- Use Railway API URL, not localhost.
- Test login, browse, cart, checkout, order detail, rider assignment, and tracking.

### Local Release

- Build `assembleRelease`.
- Install APK with `adb install -r`.
- Launch app and capture logcat.
- Verify no `ReactNativeJS` fatal errors.
- Verify API points to Railway.
- Verify images load.

### CI Release

- Build release APK only when `apps/mobile-app/**`, mobile package files, or shared packages used by mobile change.
- Cache Gradle, npm, and Android build directories.
- Upload one universal APK for manual GitHub testing.
- Later publish AAB for Play Store.

### Production Acceptance

- Customer places COD order.
- Customer places online simulated payment order.
- Admin sees order.
- Store/admin updates status safely.
- Rider accepts assignment.
- Rider location appears on tracking screen.
- Customer sees order delivered.
- Inventory decreases correctly.
- Cancelled order restores/resolves stock correctly.

## 10. Recommended Build Order

1. Fix mobile release crash and prove local release APK works.
2. Repair seed/demo catalog images and production product image data.
3. Add release smoke test script and CI sourcemap dependency check.
4. Build customer product detail, search, category filtering, and cart stock warnings.
5. Add mobile address management parity.
6. Add full order detail and live tracking parity.
7. Add inventory ledger and stock reservations.
8. Add admin low-stock dashboard and stock adjustments.
9. Add rider delivery flow and background-safe location tracking.
10. Add coupons, wishlist, reviews, and recommendations.

## 11. Immediate Next Actions

- Rebuild release APK after the Metro resolver change.
- Install the rebuilt APK locally.
- Capture logcat to prove the React crash is gone.
- Run the seed script against production database to update demo product images.
- Replace demo placeholder images with real uploaded product photos through admin.
- Add automated checks so this React 18 vs React 19 release-bundle issue cannot return.
