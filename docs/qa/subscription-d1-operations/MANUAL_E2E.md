# Subscription D-1 Operations — Manual E2E

Acceptance issue: #254

Starting main SHA: `54eee724d13b78edf8fb3541322ca7d84f86e259`

## Intended lifecycle

1. Customer creates a subscription with the first delivery tomorrow.
2. The full deterministic subscription calendar exists immediately, but future real Orders are **not** bulk-created and future inventory is **not** bulk-reserved.
3. Customer, Store Owner and Admin receive forecast/preparation visibility immediately (worker target: within the preparation poll interval).
4. Store Owner opens Tomorrow preparation and either:
   - confirms `Stock ready`, or
   - records a meaningful shortage note.
   This action writes an auditable subscription readiness event only; it must not decrement Inventory.
5. At least 24 hours before the delivery window, the normal subscription scheduler generates the one due actual Order. That normal Order creation remains the authoritative inventory reservation.
6. The regional planner creates the route without performing a live Rider assignment.
7. Approved Riders with a covering future shift can receive an advance **capacity notice**. This is explicitly not an assignment and does not require them to be online at notice time.
8. Near the configured final-assignment window (default 2 hours before the slot), the existing strict Rider eligibility engine revalidates online status, authoritative location, covering shift, breaks/overlap, active documents, vehicle/parcel constraints, pickup distance and cash exposure. Only then is the Rider actually assigned.
9. Store packing and store-to-rider handoff remain delivery-day custody actions. Existing independent Rider bag receipt is still required before the run starts.
10. Delivery proof, OTP/trusted-drop rules, COD funding, failure/retry/return, cash settlement and audit flows remain the existing authoritative flows.

## Manual acceptance scenario

Use a fresh test Customer and a published plan whose product has valid positive `weightGrams`, an applicable active Store, active delivery zone and enough Store inventory.

### A. Customer subscription

- Create a subscription whose first service date is tomorrow and choose a valid delivery window.
- Expected: subscription creation succeeds and customer sees the future calendar.
- Expected: no month of Orders is created and no month of inventory is reserved.
- Expected: Customer notification states the subscription is scheduled/preparing.

### B. Admin subscriber identity and address

Open `/admin/subscriptions`.

- Expected: subscriber Phone is populated from account phone or, when account phone is empty, the immutable delivery address phone.
- Open **Tomorrow operations**.
- Expected: delivery recipient, delivery phone, formatted delivery address, Store, products, readiness, reservation state and route/rider state are visible.
- Expected: a plan below the configured preparation minimum is identified and can be set to the minimum lead.

### C. Store D-1 preparation

Open `/store/subscriptions` and **Tomorrow prep** (also verify the Partner Store app Tomorrow overlay).

- Expected: tomorrow demand appears before packing is available.
- Expected: required SKU quantities and delivery recipient/address are visible.
- Tap **Stock ready**.
- Expected: readiness becomes READY.
- Verify inventory quantity has not changed merely because readiness was acknowledged.
- For a second occurrence/test subscription, tap **Report shortage** with a meaningful note.
- Expected: readiness becomes SHORTAGE and Admin receives an intervention notification.

### D. Actual order generation

After the occurrence enters the configured order-generation lead (minimum 24 hours):

- Wait for the BullMQ subscription scheduler or run the existing Admin controlled scheduler hook.
- Expected: exactly one Order is created for the occurrence.
- Expected: `orderSource=SUBSCRIPTION`.
- Expected: exactly that occurrence's inventory is reserved through the normal inventory ledger.
- Expected: one DeliveryJob exists and occurrence becomes `ORDER_GENERATED` before routing.
- Re-running the scheduler must not create a duplicate Order.

### E. Route planning and advance Rider capacity

Open `/admin/route-planning` for the service date and run the planner if needed.

- Expected: one route/run is created from generated deliveries.
- Expected: route planning itself does not perform final live Rider assignment, even if an older UI/client sends `assignRiders=true`.
- Expected: Store/Admin/Customer receive route-planned visibility.
- Expected: eligible approved Riders with a covering future shift may receive a `Tomorrow delivery capacity notice`, clearly labelled as advance planning rather than assignment.

### F. Final Rider assignment

Within the final assignment window (default two hours before slot):

- Put the intended Rider online using the normal Partner app flow and ensure a fresh authoritative location/heartbeat exists.
- Ensure Rider has an approved active document, covering shift, no active break/overlapping run, supported vehicle/capacity and acceptable cash exposure/pickup distance.
- Expected: scheduler preparation cycle assigns the best live-eligible Rider.
- Expected: assigned Rider receives actual route-assigned notification.
- Expected: if no Rider qualifies, run stays/returns `RIDER_NEEDED`; it is never falsely marked assigned.

### G. Delivery-day Store custody

On the service date open Store **Preparation runs / Morning Runs**.

- Expected: Store can verify route packing only for the active delivery-day run.
- Expected: bag count must match server-calculated expected count.
- Expected: Store handoff requires packed route + assigned Rider.
- Expected: Rider independently verifies bag receipt before starting the run.

### H. Delivery and cash

Complete the normal affected delivery:

- personal handover: customer OTP + Rider GPS;
- exact cash when the first/full-plan or weekly funding occurrence requires it;
- later funded occurrence must show customer amount due ₹0 and must not collect cash again.

Expected: delivery completes, subscription progress/funding updates exactly once, COD ledger remains individual/auditable, and retries with the same idempotency key do not double-collect or double-consume entitlement.

## Evidence to capture after merge/deployment

Record the accepted main SHA and deployed production revision. Capture Admin subscriber/Tomorrow operations, Store web Tomorrow prep, Store Partner Tomorrow overlay, route-planning screen, Rider advance capacity notice, final Rider assignment, Store packing/handoff, Rider receipt and final Customer delivery/progress. Include API/network errors, browser console output and ADB logcat for any failure.

If production is not serving the accepted main SHA, mark:

`BLOCKED — WRONG PRODUCTION REVISION`
