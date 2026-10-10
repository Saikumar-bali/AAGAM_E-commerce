# Store Mobile ↔ Web Parity Audit (exhaustive)

Generated from a full read of the web store surface (`apps/admin-dashboard`),
the mobile store surface (`apps/mobile-partners`), and the store-reachable
backend (`apps/api-gateway`). This is the authoritative gap list for making the
mobile store experience an exact replica of the web store console.

Status legend:

- **STALE** — implemented in mobile source but NOT in the installed APK
  (`android-1421-b8feae6` / `b8feae6`); ships with the next build.
- **ORPHAN** — screen exists on disk but is not registered in any navigator.
- **BROKEN** — UI exists but the call is wrong (e.g. param not forwarded).
- **MISSING (API-ready)** — backend endpoint already exists; only mobile UI needed.
- **MISSING (backend)** — needs a new/changed API; not available on web either
  unless noted.
- **PARTIAL** — exists on mobile but with reduced capability vs web.

---

## 0. Headline

Web store console = 11-tab Subscriptions hub + Orders + Deliveries +
Pickup Proof + Inventory + My Stores + Settings (Operating Hours + Recycle Bin) +
Notifications (inbox + preferences).

Mobile store app = 5 tabs (Home, Subscriptions, Orders, Operations, More) with
several screens, but many web capabilities are absent, read-only, orphaned, or
not shipped.

---

## 1. Already fixed in source, missing from the installed APK (STALE)

These are the user's original complaints and related work — rebuild fixes them.

1. **Offline customer → Move to Recycle Bin** (`StoreOfflineCustomersScreen`, "Delete").
2. **Recycle Bin** toggle (`Bin {n}`) with **Restore** and **Delete forever**.
3. **Offline customer directory** (searchable list, `StoreOfflineCustomersScreen`).
4. **Professional milk grid** (`StoreMilkGridScreen`).
5. **RTL layout fixes** and **unique SVG gradient ids** (`GradientSurface`).

> Ship a new APK and items 1–5 land on device. Everything below this section is a
> real code gap.

---

## 2. Orphaned screens — exist but unreachable (ORPHAN)

1. `StoreSelfDeliveryScreen.tsx` — full store self-delivery queue
   (start / fail / complete+verify, open-in-maps). Not in any navigator → the
   entire web **Deliveries** page is effectively missing.
2. `StoreOrderDetailsReferenceScreen.tsx` — legacy order detail with status
   actions + item availability; unused.
3. `StoreOperationsRouteScreen.tsx` — banner wrapper around delivery ops; unused.

---

## 3. Broken behaviour (BROKEN)

1. **"More" tab testID mismatch**: the More tab uses
   `tabBarButtonTestID="tab_settings"` while the route is `More` (cosmetic /
   test-harness hazard only).

> Correction: order search is NOT broken — `storeService.getStoreOrders` forwards
> `search` and `GET /store-owner/orders/:storeId` matches on order id, customer
> name, email and phone server-side. Web and mobile search parity holds.

---

## 4. Subscriptions hub

Web has 11 tabs: `Milk Grid (Sheet View)`, `Subscribers`, `Rider Assignments`,
`Prep list`, `Demand`, `Plans`, `Calendar`, `Runs`, `Cash`, `Exceptions`,
`Analytics`.

Mobile coverage: Subscribers, Rider Assignments, Prep (D-1 modal), Demand
(forecast section), Plans, Runs, Cash, Exceptions present in some form.
**Missing tabs: Calendar, Analytics.** And Subscribers is read-only.

### 4.1 Missing tabs / sections

1. **Calendar tab** — `GET /store/subscriptions/calendar`; date-range control
   (`Next 14 days` / `Past 14 days` / `All`), KPI tiles `Scheduled`, `Cash due`,
   `Upcoming 7-day demand`, deliveries grouped by date. **MISSING (API-ready)**.
2. **Analytics tab** — `GET /store/subscriptions/analytics`; 8 cards
   (`Active subscribers`, `Cash collected`, `Cash due`, `Upcoming 7-day demand`,
   `Open runs`, `Batches pending verify`, `Total subscribers`, `Planned deliveries`)
   + 3 tables (`Subscriptions by status`, `Deliveries by status`,
   `Cash batches by status`). **MISSING (API-ready)**.
3. **Subscriber audit trail** — `GET /store/subscriptions/subscribers/:id/audit`
   (money-change audit). **MISSING (API-ready)**.

### 4.2 Subscribers screen (mobile is read-only)

Web columns: `Customer`, `Phone`, `Plan`, `Store`, `Delivery`, `Status`,
`Progress`, `Collected / due`, `Actions`.
Mobile card shows: name, plan, status, `Next: {date}`, `Due`, `Funded`.
Missing columns on mobile: **Phone**, **Store**, **Delivery badge (rider vs
store)**, **Progress (delivered/funded)**, **Collected**.

1. **Source filter** `All / Online / Offline`. **MISSING (API-ready)**.
2. **Track / View history** (delivery tracker + calendar). `GET
   /store/subscriptions/subscribers/:id/history`. **MISSING (API-ready)**.
3. **Manage / Switch** modal. **MISSING (API-ready)** — see 4.3.
4. **Cancel subscription** action. `POST /store/subscriptions/subscribers/:id/cancel`.
   **MISSING (API-ready)**.

### 4.3 Manage subscriber modal (web, 5 sub-tabs) — entirely missing on mobile

1. **Change / Renew Plan** — `Same Plan` / `Switch Plan` / `Split AM/PM`;
   `Choose New Plan`; AM/PM product+qty selectors; frequency
   (`Daily`, `Alternate Days`, `Weekdays Only`); `Cycle Start Date`;
   `Total Deliveries`; `Initial Payment Collected Now`; `Payment Mode`
   (`Cash`/`PhonePe`/`Post-Paid`); `Renewal Note`.
   `POST /store/subscriptions/subscribers/:id/renew`. **MISSING (API-ready)**.
2. **Planned Vacation** — `Vacation From` / `Vacation To` (+ policy
   `EXTEND_PLAN` / `DEDUCT_BILL`). **MISSING (API-ready, field of renew/manual-edit)**.
3. **Delivery Slot** — `Morning (AM)` / `Evening (PM)`, "apply to remaining".
   `PATCH /store/subscriptions/subscribers/:id/manual-edit`. **MISSING (API-ready)**.
4. **Split AM/PM** setup. **MISSING (API-ready)**.
5. **Cash Flow** — ledger (`Total Collected`, `Balance Due`), `Record Customer
   Payment` (`Amount (₹)`, `Payment Mode`, note).
   `POST /store/subscriptions/subscribers/:id/record-payment`. **MISSING (API-ready)**.
6. **Edit Balances** — `Amount Due (₹)`, `Amount Collected (₹)`, `Note`.
   `PATCH /store/subscriptions/subscribers/:id/manual-edit`. **MISSING (API-ready)**.
7. **Danger zone** — offline subscriber `Move to Recycle Bin` / `Delete Forever`;
   online accounts non-deletable notice. (Mobile has bin actions in the offline
   directory, not from the subscriber record.) **PARTIAL / MISSING (API-ready)**.
8. **Cancel Subscription** confirm modal (reason, "Keep Subscription"). **MISSING (API-ready)**.

### 4.4 Plans tab

Web: plan cards + `Show {n} more` / `Show less` expand.
Mobile: read-only cards; items capped at 4 with `+N more` but no expand.
**PARTIAL** (low priority). No create/edit/delete on web either.

### 4.5 Rider Assignments

Web dialog: `Rider Assignments`, date nav (`Today`/`Tomorrow`), slot filter
(`All slots`/`AM`/`PM`), summary cards (`Stops today`, `Assigned`, `Unassigned`,
`Cash to collect`), per-rider cards, unassigned bucket.
Mobile `StoreRiderAssignmentsScreen`: date nav, metrics, rider cards, unassigned
multi-select + dispatch. **PARTIAL** — missing slot filter and the "cash to
collect collected" hint detail. (API present.)

### 4.6 Prep list

Web + mobile both present. Mobile = `StoreSubscriptionPreparationModal`.
Parity acceptable. Web has a standalone tab with table + KPIs; mobile a modal.
**PARTIAL** (cosmetic).

---

## 5. Milk Grid (web `MilkDeliveryGrid`, 3472 lines vs mobile read-only)

Mobile `StoreMilkGridScreen`: month nav, auto-dispatch button, read-only day-cell
modal. Web is a full operations console.

### 5.1 Toolbar / views

1. **View mode `Today's Route` (cards)** vs `31-Day Matrix`. Mobile has matrix
   only. **MISSING**.
2. **Slide to today** (`Today ({n})`) jump button. **MISSING**.
3. **Pack Summary** modal (`Morning Packing & Dispatch Sheet`: Buffalo/Cow/Total
   litres, route stops, completed). `GET /store/subscriptions/dispatch-summary`.
   **MISSING (API-ready)**.
4. **Export Sheets** → CSV download. `GET /store/subscriptions/grid/export-csv`.
   **MISSING (API-ready)**.
5. **Fullscreen** toggle. N/A-ish; **MISSING**.

### 5.2 Filters / search

1. **Search** `customer, phone, locality`. **MISSING**.
2. **Slot filter** `All / AM / PM`. **MISSING**.
3. **Filter Dues / ⚠️ Only Dues** toggle. **MISSING**.
4. **Customer channel** `All / 🌐 Online / 🏪 Offline`. **MISSING**.
5. **Sort** `Pending First` / `# Sequence`; **Hide Done ({n})**. **MISSING**.

### 5.3 Per-cell quick actions — the core of the web grid

Web cell modal has 3 tabs; mobile cell modal is read-only. All **MISSING
(API-ready**, `POST /store/subscriptions/deliveries/:id/quick-action`**)**:

1. **Quick Status** — `Mark Delivered ✓` / `Undo Delivery` (`TOGGLE_DELIVERED`).
2. **Shift AM↔PM** (`TOGGLE_SLOT`).
3. **Mark Skipped (Not Taken)** (`SKIP`).
4. **Default rider** info + `Set {name} as permanent default rider`
   (`POST /store/subscriptions/:subscriptionId/default-rider`).
5. **Delegate Stop to Rider** (per-cell, with `Set as permanent default rider`).
6. **Temporary Substitute Rider** (select + `From Date`/`To Date` + re-dispatch
   checkbox). `POST /store/subscriptions/:subscriptionId/temporary-rider`.
7. **Photo proof** `View Proof` → `GET /upload/evidence-url`.
8. **Ledger snapshot** `Paid in Month` / `Current Outstanding Due`.
9. **Extra / Shift Add-on** (full flow): unit modes `Grams/Kg`, `Bowls/Pk`,
   `Liters/ml`, `Custom`; `Catalog Product` + `Custom Product / Manual Rate`;
   `Unit Price (₹)`; `Consecutive Days`; `Shift Target`; buttons
   `Attach {n} Days {slot} Delivery` (`ATTACH_EVENING_MILK`) and
   `Add as Single Day Extra Today Only` (`EXTRA_MILK`).
10. **Payment & Renew** — `Record Subscriber Payment` with presets
    (`Full Due`, `₹80`, `₹160`, `₹500`, `₹1,000`), `Amount ₹`, mode
    `Cash in Hand` / `PhonePe / UPI` (`RECORD_PAYMENT`); `Void Recorded Payment`
    (`VOID_PAYMENT`); `Renew 30 Days`
    (`POST /store/subscriptions/subscribers/:id/renew`).

### 5.4 Grid row / card actions

1. **Monthly Bill / Statement** per row (`Share2`) — `GET
   /store/subscriptions/customer/:id/statement`; modal with `Customer`, `Plan`,
   `Deliveries {delivered} · {skipped}`, `Extra Milk`, `Total Paid`,
   `Balance Due`, `WhatsApp Preview`, `Copy Text`, `Send on WhatsApp`.
   **MISSING (API-ready)**.
2. **Proof of Delivery** viewer (`Captured At`, `GPS Coordinates` + Maps,
   `GPS Accuracy`, `Cash Collected`). **MISSING (API-ready)**.
3. **Card view KPIs** `Completed / Packed / Sold / Left` + progress bar +
   `All Deliveries Completed for Today!`. **MISSING**.

### 5.5 Bulk Dispatch modal — mobile has only auto-dispatch

Web `Dispatch Deliveries to Rider`:
1. **Target date** single (`Today`/`Tomorrow`/day select) vs **Date Range**
   (`From (Day)`/`To (Day)`).
2. **Auto-Dispatch** (`Pre-Assigned Default Riders ({n})` →
   `POST /store/subscriptions/auto-dispatch-default-riders`).
3. **Rider selector** (`No active, approved riders found…`).
4. **Shift filter** `All Slots / AM / PM`, **Channel** `All / Online / Offline`.
5. **Per-stop checkboxes** + `Select All` + `Clear`; summary `Selected: {n}`,
   `Estimated Volume`, `Expected Cash`.
6. **Save as temporary substitute rider** / **Save as permanent default rider**.
   `POST /store/subscriptions/dispatch-to-rider`.

Mobile: `StoreMilkGridScreen` "Dispatch" = auto-dispatch only; the full bulk
modal (manual selection, date range, filters, save-as-default/temp) is
**MISSING (API-ready)**.

---

## 6. Orders

Mobile `StoreOrdersScreen` tabs: New, Preparing, Ready, Pickup, Delivered, Issues.

1. **Order type filter** `All / Subscription / One-time`. **MISSING**.
2. **Sort** `Work order / Newest first / Scheduled first`. **MISSING**.
3. **Working search** (order/customer/phone server-side). **PARITY** (see §3).
4. **Day sections** `Needs action now / Scheduled today / Scheduled tomorrow /
   Scheduled later / Unscheduled & past`. Mobile is flat per-tab. **MISSING**.
5. **Clear {n} filters** control. **MISSING**.
6. **Group filters as KPI tiles** `Needs action / In progress / With rider /
   Done / Cancelled`. Mobile tabs approximate but omit `With rider` breadth and
   `Store delivered` (`STORE_DELIVERED`) grouping. **PARTIAL**.
7. Pagination: web = `Show {n} more`; mobile = explicit Previous/Next. **PARTIAL**.

Order detail (unavailable/substitutes/status actions) = **parity**.

---

## 7. Deliveries (store self-delivery) — web page vs mobile orphan

Web `/store/deliveries`:

1. Date rail (today + 13 days), status KPIs `All/Pending/Out for delivery/
   Delivered/Failed`. **MISSING**.
2. Search `customer, phone or sequence`. **MISSING**.
3. **Slot filter** `All slots / Morning / Evening`. **MISSING**.
4. **Start delivery**. **MISSING (API-ready)** (`POST /store-self-delivery/start/:id`).
5. **Complete & collect cash** modal (`Customer name`, `Customer phone`,
   `Cash collected (₹)`, `Notes`). **MISSING (API-ready)**.
6. **Mark failed** modal (`Why did this delivery fail?`). **MISSING (API-ready)**.
7. **Edit delivery record** modal (`Update status`, `Cash collected`,
   `Failure reason`/`Notes`). **MISSING (API-ready)**.
8. Cash summary `To collect` / `Recorded`. **MISSING**.

All reachable only by wiring `StoreSelfDeliveryScreen` (ORPHAN §2).

---

## 8. Pickup Proof

Web page: `Parcel count` input, `Issue PIN`, **`Issue QR`**, `Confirm handoff`.
Mobile: `StorePickupVerification` has PIN generation + confirm handoff.
**MISSING: `Issue QR` (`QR_CODE` challenge method).** (API-ready —
`POST /orders/delivery-operations/jobs/:id/pickup/challenge { method:'QR_CODE' }`.)
Mobile also lacks the `Parcel count` confirmation input parity (uses default).

---

## 9. Inventory

Mobile `StoreInventoryScreen` has My products (price, stock steppers, save,
Listed/Hidden, auto-hide) and Add products (catalogue search, opening stock,
price, add) + stats. Web inventory equivalent.
**Parity** (neither has product delete — that is a backend gap, §14).

---

## 10. Settings

Web `/store/settings`: tabs `Operating Hours` + `Recycle Bin`.

1. **Operating Hours editor** — weekly schedule, per-day open/closed,
   `+ Add window` (up to 2/day), `Remove`, `Timezone` (Asia/Kolkata, Dubai,
   Karachi, Kathmandu, Dhaka, UTC), `Save operating hours`, open/closed status
   summary. `GET`/`PUT /store-owner/stores/:id/operating-hours`.
   **MISSING (API-ready)**.
2. **Recycle Bin** tab (embeds offline customers). Mobile reaches the bin via
   `StoreOfflineCustomersScreen` toggle. **PARTIAL** (reachable, different entry).

Mobile additionally has **store profile edit** (name/address/phone) via
`StoreSettingsScreen` — web's store settings does not expose this, so mobile is
ahead here.

---

## 11. Notifications

Web: `NotificationCenter` (inbox, `Unread`, `Last 24h`, `Push`, push enable,
`Push pref` toggle, mark read) + `NotificationPreferences`
(global `Device push` + `In-app inbox`, plus per-event push/in-app toggles for
18 events filtered to STORE_OWNER).

Mobile: `PartnerNotificationsScreen` (inbox, ALL/UNREAD/UPDATES, mark read).

1. **In-app notification preferences** (global + per-event push/in-app toggles).
   `GET`/`PATCH /notifications/preferences`. **MISSING (API-ready)** — wired on
   mobile only for the rider settings screen.
2. **Enable device push** from the store notification screen.
   `POST /notifications/push/subscriptions`. **MISSING (API-ready)**.
3. Per-event catalogue (ORDER_PLACED, DISPATCH_JOB_CREATED, PICKUP_VERIFIED,
   OUT_FOR_DELIVERY, DELIVERY_FAILED, …). **MISSING**.

---

## 12. Offline customers

Mobile `StoreOfflineCustomersScreen`: create, list, search, bin, restore, purge.
Web `OfflineCustomersPage`:

1. **Customer detail view** (stats `Active Subs`, `Total Orders`, `Collected`,
   `Due`; address; subscriptions list). `GET
   /store/subscriptions/offline-customers/:id`. **MISSING (API-ready)**.
2. **Delivery tracker** per subscription (per-day table, filters
   `all/delivered/pending/failed`, summary tiles). `GET
   .../offline-customers/:id/delivery-tracker`. **MISSING (API-ready)**.
3. **Create customer with map + GPS** (`📍 Use Live GPS`, map pin, reverse
   geocode `GET /geo/reverse`, `Hide/Show Map`). Mobile create form has address
   fields but no map/GPS picker. **PARTIAL**.
4. **Pagination** `Previous`/`Next` + `Page {n} of {m}`. Mobile uses pageSize 100
   with no pager. **PARTIAL**.

---

## 13. Dashboard

Web `/store`: KPI (`My Stores`, `Products` with `{n} low stock`, `Orders`,
`Revenue`), store list, `Refresh`.
Mobile `StoreDashboard`: revenue hero + sparkline, stats (Orders/Revenue/Stores/
Products), store search, store list.
**PARTIAL** — mobile omits the explicit **low-stock** indicator and per-store
product/order counts on the card.

---

## 14. Backend gaps (not on web either — need API work)

These are **not** web-parity items (web lacks them too) but are common asks:

1. **Store-side pause/resume subscription** — only customer-side exists
   (`POST /customer/subscriptions/:id/pause|resume`). **MISSING (backend)**.
2. **Delete/delist a product from store assortment** — no store delete endpoint
   (only `isListed` toggle). **MISSING (backend)**.
3. **Edit an offline customer** — no update endpoint (create + delete/restore only).
   **MISSING (backend)**.
4. **Import (CSV)** of customers/products. **MISSING (backend)**.
5. **Print** (sheets/bills/invoices). **MISSING (backend)**.
6. **Promotions / coupons** — ADMIN/customer only; no STORE_OWNER scope.
   **MISSING (backend)**.
7. **Invoices / billing entity** — only ad-hoc statement + COD settle.
   **MISSING (backend)**.
8. **Staff / users / roles management** for a store. **MISSING (backend)**.
9. **Store delete/restore** are ADMIN-only (`POST /stores/:id/restore`,
   `DELETE /stores/:id`). **MISSING (backend, if store-owner needed)**.

---

## 15. Store-reachable endpoint coverage snapshot

Present on mobile today: grid, subscribers (read), plans (read), calendar (no
UI), runs/demand/exceptions/cash-batches, packing, pickup, cash-batch verify,
preparation + readiness, offline customers CRUD (create/list/delete/restore/
purge), manual-customer, manual-subscribe, rider assignments, available riders,
dispatch-to-rider, auto-dispatch, default/temporary rider, orders (store-owner),
order status/ready/store-delivery, item unavailable/substitutes, assortment,
catalog, inventory update, store profile, notifications inbox.

Store-reachable endpoints **not used by mobile** (all API-ready):
`GET /store/subscriptions/grid/export-csv`,
`GET /store/subscriptions/calendar`,
`GET /store/subscriptions/analytics`,
`GET /store/subscriptions/dispatch-summary`,
`GET /store/subscriptions/customer/:id/statement`,
`GET /store/subscriptions/subscribers/:id/history`,
`GET /store/subscriptions/subscribers/:id/audit`,
`POST /store/subscriptions/deliveries/:id/quick-action`,
`POST /store/subscriptions/subscribers/:id/renew`,
`POST /store/subscriptions/subscribers/:id/cancel`,
`POST /store/subscriptions/subscribers/:id/record-payment`,
`PATCH /store/subscriptions/subscribers/:id/manual-edit`,
`POST /store/subscriptions/custom-subscribe`,
`POST /store/subscription-operations/runs/:runId/stops/:stopId/return`,
`GET /store-self-delivery/*` (queue, start, complete, fail, update),
`GET /store-owner/stores/:id/operating-hours`,
`PUT /store-owner/stores/:id/operating-hours`,
`GET/PATCH /notifications/preferences`,
`POST/GET/DELETE /notifications/push/subscriptions`,
`GET /upload/evidence-url` (proof viewer),
`GET /stores/:id/orders`,
`GET /orders/:id/tracking`.
