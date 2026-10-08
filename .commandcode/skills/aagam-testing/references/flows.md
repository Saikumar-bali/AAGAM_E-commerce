# AAGAM end-to-end flows

Every flow below is written the way the **UI** presents it, with the API call and
the `DeliveryJob` status each step produces, so a tester can drive either surface
and still know where they are in the state machine.

> Update this file whenever you discover a step it does not describe. See the
> self-update protocol in `../SKILL.md`.

**Last verified:** 2026-10-08 against revision `2be0cfb6` / `cb1e85fc` on `main`.

---

## 0. Identity and ID conventions (read this first)

A tester who does not know these will mis-match records across roles.

| Surface | How an order is displayed | Example |
|---|---|---|
| Customer shop, store portal | `order.id.slice(-8).toUpperCase()` | `JFS8M0RE` |
| Admin orders table | raw `order.id`, lower case | `cmuyuu8k…jfs8m0re` |
| Rider portal | raw `order.id`, upper case | `CMUYUU8K` |

So **`JFS8M0RE` = `cmuyuu8k…` = `CMUYUU8K`** — one order, three labels.

Three distinct ids are in play and are *not* interchangeable:

- **`Order.id`** — commercial record. What the customer and store show.
- **`DeliveryJob.id`** — operational record created when the order is packed.
  Every `/orders/delivery-operations/jobs/:id/…` call takes this one.
- **`DispatchAssignment.id`** — one rider offer attempt. `/orders/dispatch/assignments/:id/accept`.

Cross-check any of them through the store queue:

```text
GET /api/orders/delivery-operations/queue   -> [{ id, orderId, status, currentRider, pickupProof, … }]
```

### Roles and entry points

| Role | Entry | Tabs / sections observed in the UI |
|---|---|---|
| Customer | `/login` → `/shop` | Shop, My Orders, Subscriptions, Notifications, All menu |
| Store owner | `/login` → `/store` | Dashboard, Notifications, Orders, Deliveries, Pickup Proof, Subscription Runs, Inventory, My Stores, Settings |
| Rider | `/login` → `/rider` | Home, Job Offers, Current Delivery, Pickup Tasks, Notifications, History, Earnings, Morning Runs, COD & Settlements, Performance, Availability, Profile, Support |
| Admin | `/login` → `/admin` | Dashboard, Partner Applications, Analytics, Notifications, Support, Dispatch, Delivery Exceptions, Stores, Customers, Products, Delivery Zones, Localities, Delivery Fee Rules, Promotions, Subscriptions, Store Delivery, Route Planning, Riders, Orders, Excel Report, Live Tracking |

---

## Flow A — Customer subscribes → store assigns → rider delivers → customer confirms

This is the primary money-and-parcel flow. Walk it in order; each step names the
UI control, the API, and the resulting status.

### A1. Customer requests the plan

1. `/login` as the customer → lands on `/shop`.
2. Nav **Subscriptions** → `/shop/subscriptions`.
   - Tabs: **Active / Upcoming / Paused / Completed**.
   - A freshly requested plan sits under **Upcoming** with a
     `PENDING CASH COLLECTION` pill, `0 of N delivered`, `0% funded`.
   - **Active** correctly shows *"No active subscriptions"* until the first
     delivery happens — this is expected, not a bug.
3. **Choose plan** on a published plan → review → subscribe.
   - Creates a `CustomerSubscription` in `PENDING_CASH_COLLECTION` (or
     `PAYMENT_DUE`). Nothing is charged up front for COD plans.
4. Open the plan detail. Assert it shows:
   - progress `0 of N delivered`,
   - **NEXT DELIVERY** date and `Pending ₹… · collect on next delivery`,
   - **Changed your mind? / Cancel before payment** (only while no cash collected),
   - **Delivery calendar & history** with per-day rows:
     `ORDER_GENERATED`, `SKIPPED`, `SCHEDULED` and the slot window.

### A2. The day's order is generated (no UI action)

Nightly generation turns each due `SubscriptionDelivery` into:

```text
SubscriptionDelivery.status = ORDER_GENERATED
  + Order (+ Payment PENDING_COD)
  + DeliveryJob(WAITING_FOR_DISPATCH)
  + DeliveryRunStop
```

**Assertion:** all four are created together. If the row says `ORDER_GENERATED`
but no `DeliveryJob` exists, the rider board will silently miss it.

### A3. Store assigns the rider

1. `/store/orders`.
   - Stage counters: **NEEDS ACTION / IN PROGRESS / WITH RIDER / DONE / CANCELLED**.
   - Type filter **All / Subscription / One-time**; search by order, customer or
     phone; sort **Work order / Newest first / Scheduled first**.
   - The counters read `0` until the first paint finishes — **wait for
     `N of M orders shown` before concluding the queue is empty.**
2. The order card shows: order code, status, `Subscription` badge,
   `Customer · email · date`, `Rider: <name>`, amount, item count,
   `COD · PENDING_COD`, and an expandable **Picking list** (`Cow milk 1/4L × 1`).
3. Assign the rider (dispatch / rider-assignments surface).

**Result:** `DeliveryJob → RIDER_ASSIGNED`, order status `RIDER_ASSIGNED`.

### A4. Rider travels to the store

1. `/rider` — the card shows `CURRENT DELIVERY`, the order code, a status pill
   and a one-line instruction.
2. **Start trip to store** → `RIDER_EN_ROUTE_TO_STORE`.
3. Arrive → `RIDER_AT_STORE`.

**UI copy defect (see register):** at `RIDER_AT_STORE` the card reads *"At store —
Wait for the store to verify parcel handoff."* The store **cannot** proceed yet.
The rider's actual next step is on `/rider/pickup`.

### A5. Rider verifies the item checklist  — THE GATE

`/rider/pickup`.

- **Before the multi-parcel fix** the page rendered only `GET /riders/portal/pickup`
  (`pickups()[0]`), so any parcel that was not first in `createdAt asc` order was
  unreachable and permanently blocked its own handoff. Fixed in `cb1e85fc`;
  the page now reads `GET /riders/portal/pickups` and renders a selector.
- Select the parcel, confirm each line's quantity, optionally enter a
  **Parcel/seal code**, click **Verify checklist**.

```text
POST /riders/portal/pickup/:deliveryJobId/verify
  { lines: [{ orderItemId, checkedQuantity }] }
```

**Assertions:**
- every line's `checkedQuantity` must equal the order quantity or the API returns
  *"Every item quantity must match the order before pickup verification"*;
- `riderPickupTask.status` becomes `VERIFIED` with `verifiedAt` set;
- a task is auto-created `PENDING` the first time the list is read.

The rider can instead choose **Report** (Missing item / Wrong quantity / Damaged
parcel / Unsealed parcel / Other + note) which sets `PROBLEM_REPORTED` and
**blocks** handoff — that is correct behaviour.

### A6. Store hands the parcel over

`/store/pickup-proof`. One card per job with `status === "RIDER_AT_STORE"`:
order code, `Rider: <name>`, **PARCEL COUNT** (default 1),
**Issue PIN**, **Issue QR**, **Confirm handoff**.

```text
POST /orders/delivery-operations/jobs/:id/pickup/confirm  { parcelCount }
   or /pickup/challenge { method: STORE_PICKUP_PIN | QR_CODE, parcelCount }
```

**Ordering of guards — know it, because the error message you get is the *second*
guard, not the first:**

1. `actor` must be the owning store user;
2. `job.status === RIDER_AT_STORE`, else *"Store handoff can be confirmed only
   while the Rider is at the store"*;
3. `assertPickupChecklist` — `riderPickupTask.status === VERIFIED`, else
   *"The Rider item and parcel checklist must be verified before handoff"*;
4. `pickupProof` must not already exist, else *"Pickup handoff is already verified"*.

A PIN/QR is **not** required for store-confirmed handoff. `Confirm handoff` uses
`STORE_CONFIRMED_HANDOFF` with no challenge.

**Result:** `PickupProof` row created (method, parcelCount, storeUserId), a
`PICKUP_VERIFIED` operation is written, and the job transitions
`RIDER_AT_STORE → PICKUP_VERIFIED`.

**Assertion:** the card disappears from `/store/pickup-proof` after handoff —
the page filters `job.status === "RIDER_AT_STORE"`. Confirm through the queue API
that the job really moved, rather than assuming the record vanished.

### A7. Rider delivers

1. `/rider` — card now reads **Pickup verified** / *"Start delivery after
   receiving the parcel."* → **Start delivery** → `OUT_FOR_DELIVERY`.
2. Arrive at customer → `RIDER_AT_CUSTOMER`.
   `POST /orders/delivery-operations/jobs/:id/otp/issue` is only legal at
   `RIDER_AT_CUSTOMER`.
3. Collect COD (₹225 in the reference run) — `cod/collect`. The COD ledger and
   the rider's earnings ledger are **separate**; `/rider/cod` states
   *"Rider earnings never enter this ledger"*.
4. **Confirm delivered** → `DELIVERED`.

**Assertions:**
- `DeliveryJob`, `Order`, `SubscriptionDelivery` and the `DeliveryRunStop` all
  read `DELIVERED`;
- the order's status history contains a real `… → DELIVERED` transition (an
  `OUT_FOR_DELIVERY → OUT_FOR_DELIVERY` row means a writer bypassed
  `DeliveryWorkflowService.transitionWithinTransaction`);
- the subscription day cell and `cashCollectedPaise` update, and
  `reconcileSubscriptionBalance` still agrees with the ledger;
- completion activates the contract (`PENDING_CASH_COLLECTION` → `ACTIVE`, and
  → `COMPLETED` on the final delivery).

### A8. Customer sees the result

`/shop/orders` — filters **All / Active / Delivered / Cancelled**; totals
**TOTAL ORDERS / TOTAL SPENT / DELIVERED / ACTIVE**. The delivered card shows
`Delivered by Store` or `Delivered` with its proof. `/shop/subscriptions`
**Active** tab now lists the plan with `N of M delivered`.

---

## Flow B — Store self-delivery (no rider)

Used when the store delivers directly; the customer card reads **Store Delivery**
/ *"Delivered directly by your store partner."*

1. `/store/orders` → order in **IN PROGRESS** → mark ready / start store delivery.
2. `/store/deliveries` → **Subscription deliveries**. A date rail
   (`TODAY / TOMORROW / SAT 10 Oct …`) with per-day counts; each row has
   customer, address, status (`Scheduled`), `AM|PM`, window (`06:00 - 07:00`),
   amount, and **Start delivery** / **Edit**.
3. Complete → the order shows **Delivered by Store**.

**Assertion:** a store-delivered subscription must not demand rider handover
proof. Customer surfaces should show *"Collected at store"* for
`storeDelivery` subscriptions instead of the handover picker
(`PERSONAL_HANDOVER / TRUSTED_DROP / SECURITY_RECEPTION` is a rider concept).

---

## Flow C — Store grid: packed vs sold vs left

See `store-grid.md` for the litre math. The UI path:

1. `/store/subscriptions` → `MilkDeliveryGrid`.
2. Grid calls `GET /store/subscriptions/grid?year&month`.
3. Daily totals call `GET /store/subscriptions/dispatch-summary?date=YYYY-MM-DD`
   → `summary.totalBuffaloMilkLiters`, `totalCowMilkLiters`, `totalMilkLiters`,
   `totalStops`, `completedStops`, `pendingStops`, `cashToCollectPaise`,
   `cashCollectedPaise`.

**The three numbers to reconcile:**

```text
packed  = totalMilkLiters           (what the rider left the store with)
sold    = sum(totalLiters) over stops where status == DELIVERED
left    = totalMilkLiters - sold    (pending + skipped/returned volume)
```

**Assertion:** a customer skip must not inflate packed — skipped and cancelled
occurrences are excluded from the query and contribute `0` litres.

Quick actions on a cell: `TOGGLE_DELIVERED`, `SKIP`, `EXTRA_MILK`,
`TOGGLE_SLOT`, `RECORD_PAYMENT`, `VOID_PAYMENT`, `ATTACH_EVENING_MILK`.

---

## Flow D — Rider operations loop

| Step | Surface | Result |
|---|---|---|
| Receive offer | `/rider/offers` (Job Offers) | accept → assignment; reject → released |
| Start trip | `/rider` → **Start trip to store** | `RIDER_EN_ROUTE_TO_STORE` |
| Arrive | `/rider` | `RIDER_AT_STORE` |
| Verify items | `/rider/pickup` → **Verify checklist** | `riderPickupTask VERIFIED` |
| Receive parcel | `/store/pickup-proof` (store acts) | `PICKUP_VERIFIED` |
| Deliver | `/rider` → **Start delivery** → arrive → OTP → COD → **Confirm delivered** | `DELIVERED` |
| Failure | `/rider/delivery` → failure/return controls | `DELIVERY_FAILED` → `RETURNING_TO_STORE` → `RETURNED_TO_STORE` |
| Cash | `/rider/cod` | COD ledger, batch, settlement |
| Earnings | `/rider/earnings` | independent of the COD ledger |

`/rider/delivery` (**Current Delivery**) is the canonical single-job view: store
pickup block, customer block, **Operational actions**, **Parcel and item
checklist**, and the **Audit timeline** (`JOB_CREATED` → `ASSIGNMENT_CREATED` →
`ASSIGNMENT_OFFERED` → `RIDER_ASSIGNED` → `ASSIGNMENT_ACCEPTED` → …).

**Rider busy-state assertion:** a `DeliveryRun` with `totalStopCount = 0` and no
`DeliveryRunStop` rows must never pin a rider `BUSY`.

---

## Flow E — Admin oversight

1. `/admin` — ACTIVE ORDERS, 30-DAY REVENUE, ACTIVE STORES, PROVISIONED RIDERS.
2. `/admin/orders` — **Order Management**. Queues **ALL QUEUE / AT RISK SLA /
   UNASSIGNED**; status filter across Pending → Cancelled; search by
   order/store/customer/phone; **Bulk Status Update**. Columns: ORDER ID, CUSTOMER,
   STORE, AMOUNT, STATUS, SLA, DATE, ACTIONS.
   - Counters are `0` on first paint; wait for `ALL QUEUE <n>` before concluding.
3. `/admin/dispatch`, `/admin/route-planning` — planned runs, unassigned orders,
   regional planner, force-cancel for a started-but-empty run.
4. `/admin/riders` — per-rider workload (`activeDeliveries`, `activeRuns`,
   `canBeFreed`), **Make available** / **Set online**.
5. `/admin/delivery-exceptions` — failure decisions and *System failure resolution*.
6. `/admin/subscriptions`, `/admin/store-delivery`, `/admin/live-tracking`,
   `/admin/stores`, `/admin/customers`, `/admin/promotions`.

**Assertion:** admin bulk status changes must land in the order's status history
as a real transition, not a silent column write.

---

## Flow F — Failure and return

```text
OUT_FOR_DELIVERY / RIDER_AT_CUSTOMER
   -> DELIVERY_FAILED            (attempt failed)
        -> RETURNING_TO_STORE    (rider-initiated return is allowed for RIDER actors)
        -> RETURNED_TO_STORE     (parcel back at the store)
   -> DELIVERED                  (retry succeeds)
```

The rider must always have a way to hand a failed parcel back; a rider calling
`POST /orders/delivery-operations/jobs/:id/return/start` gets a
`RETURN_TO_STORE` override decision instead of a permission refusal. Admin calls
keep the strict policy check.

---

## Known stall points

Carry these with you — they are where testing time is lost.

1. **Empty counters on first paint.** Store orders, admin orders and the store
   pickup-proof page all render `0` before their fetch resolves. Always wait for
   the rendered total (`N of M orders shown`, `ALL QUEUE <n>`).
2. **Handoff gate.** See Flow A step A5/A6 — the checklist gate reads like a
   store problem but is a rider action.
3. **Single-task pickup page.** Fixed in `cb1e85fc`; if the served revision
   predates it, only the first parcel is reachable.
4. **Deploy lag.** `main` ≠ live until `deploy.yml` finishes. Always record the
   revision you tested.
5. **Shared browser session.** Logging in as one role signs the others out.
