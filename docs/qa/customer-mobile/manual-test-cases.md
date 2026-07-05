# Customer Mobile Manual Test Cases

**Scope:** `apps/mobile-customer` end-to-end local testing from signup to order tracking.

## Test data needed

- Customer user credentials or a new customer signup email.
- Active store, active category, and active products.
- Inventory assigned to nearest active store.
- One serviceable delivery address near store.
- One non-serviceable address outside delivery radius.

## TC-01 Fresh app launch

Steps:
1. Install and launch customer app.
2. Ensure no existing saved session.

Expected:
- Loading screen appears briefly.
- Login screen appears.
- No crash.

Proof:
- Login screenshot.

## TC-02 Signup validation

Steps:
1. Open signup.
2. Submit empty fields.
3. Try invalid email, weak password, and invalid phone.

Expected:
- Clear validation messages.
- Invalid form does not create account.
- App does not crash.

Proof:
- Validation screenshot.

## TC-03 Customer signup success

Steps:
1. Enter valid name, email, password, and phone.
2. Submit signup.

Expected:
- Customer is authenticated.
- Customer tabs appear.
- Profile shows user identity.

Proof:
- Shop or Profile screenshot.

## TC-04 Existing customer login

Steps:
1. Logout if needed.
2. Login with customer credentials.

Expected:
- Login succeeds.
- Shop screen loads.

Proof:
- Shop screenshot.

## TC-05 Wrong role blocked

Steps:
1. Logout.
2. Try a rider, store, or admin account in the customer app.

Expected:
- App blocks access.
- Customer-only message appears.
- Customer tabs do not appear.

Proof:
- Blocked role screenshot.

## TC-06 Session restore

Steps:
1. Login as customer.
2. Close and reopen app.

Expected:
- Valid session restores.
- User remains in customer area.

Proof:
- Screenshot after restart.

## TC-07 Logout

Steps:
1. Open Profile.
2. Tap Logout.

Expected:
- Auth token clears.
- App returns to Login.

Proof:
- Login screenshot after logout.

## TC-08 Product catalog load

Steps:
1. Login as customer.
2. Open Shop.
3. Pull refresh.

Expected:
- Categories load.
- Product list loads.
- No infinite spinner.

Proof:
- Product grid screenshot.

## TC-09 Search, category, and sort

Steps:
1. Search a known product.
2. Select a category.
3. Try price low-high and high-low sorting.

Expected:
- Results match filters.
- Empty state appears if there are no matches.

Proof:
- Filtered result screenshot.

## TC-10 Product detail add to cart

Steps:
1. Open an in-stock product.
2. Add to cart.
3. Open Cart.

Expected:
- Product detail loads.
- Cart badge updates.
- Item appears in cart.

Proof:
- Product detail and cart screenshots.

## TC-11 Out-of-stock product

Steps:
1. Open an out-of-stock product.
2. Try to add it.

Expected:
- Add button is disabled or shows unavailable.
- Cart does not receive the item.

Proof:
- Screenshot.

## TC-12 Cart quantity and persistence

Steps:
1. Add products.
2. Increase and decrease quantities.
3. Close and reopen app.

Expected:
- Totals update correctly.
- Quantity does not become invalid.
- Cart persists if product decision requires persistence.

Proof:
- Cart screenshots before and after restart.

## TC-13 Add delivery address

Steps:
1. Open Profile.
2. Add new address.
3. Use location button or map pin.
4. Fill required fields and save.

Expected:
- Address saves.
- Address appears in saved list.

Proof:
- Address list screenshot.

## TC-14 Address edit, delete, and default

Steps:
1. Edit an address.
2. Set default address.
3. Delete a non-needed address.

Expected:
- Changes persist after refresh.
- Only one default address is shown.

Proof:
- Before/after screenshots.

## TC-15 Checkout quote for serviceable address

Steps:
1. Add in-stock products.
2. Open Cart and Checkout.
3. Select serviceable address.

Expected:
- Quote loads.
- Delivery fee and grand total appear.
- COD order button is enabled.

Proof:
- Checkout screenshot.

## TC-16 Checkout outside delivery radius

Steps:
1. Select non-serviceable address.

Expected:
- Serviceability error appears.
- Order button is disabled.

Proof:
- Screenshot.

## TC-17 Checkout stock guard

Steps:
1. Add item with insufficient inventory.
2. Try checkout or place order.

Expected:
- Checkout blocks with product-specific error.
- Cart remains intact.

Proof:
- Screenshot and visible error text.

## TC-18 COD order placement

Steps:
1. Add in-stock item.
2. Select serviceable address.
3. Select COD.
4. Tap Place COD Order once.

Expected:
- Order is created.
- Cart clears.
- App opens order detail.

Proof:
- Order detail screenshot and order ID.

## TC-19 Duplicate tap protection

Steps:
1. Repeat checkout.
2. Rapidly tap Place Order twice.

Expected:
- Only one order is created.
- Button disables while request is pending.

Proof:
- Orders list before/after.

## TC-20 Orders list

Steps:
1. Open Orders.
2. Pull refresh.
3. Open latest order.

Expected:
- Latest order appears.
- Status, total, store, and time are visible.
- Detail opens.

Proof:
- Orders screenshot.

## TC-21 Order detail

Steps:
1. Open latest order detail.

Expected:
- Timeline, items, address snapshot, payment status, and total appear.

Proof:
- Full detail screenshots.

## TC-22 Tracking waiting state

Steps:
1. Open order detail before rider assignment.

Expected:
- Waiting state is clear.
- No map crash.

Proof:
- Screenshot.

## TC-23 Rider assigned/live tracking

Steps:
1. Assign rider through operations flow.
2. Rider sends location update.
3. Open customer order detail.

Expected:
- Rider status updates.
- Map shows available markers.
- ETA, distance, and last update show when available.

Proof:
- Customer order tracking screenshot.

## TC-24 Delivered/cancelled final states

Steps:
1. Move order to delivered or cancelled from operations side.
2. Refresh customer order detail.

Expected:
- Final status is visible.
- Tracking stops safely.

Proof:
- Screenshot.

## TC-25 API unavailable state

Steps:
1. Test with API temporarily unavailable.
2. Open Shop, Orders, and Checkout.

Expected:
- Clear retry state.
- No crash.

Proof:
- Error-state screenshot.
