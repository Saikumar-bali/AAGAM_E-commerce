# Store grid — packed / sold / left litres

**Question this file answers:** *a rider left the store with X litres — how many
were sold, and how many litres came back / are still pending?*

Read this before asserting on any litre number. The totals are **derived from
strings** (plan names, add-on labels, quantity labels), which is where this
codebase has regressed repeatedly.

**Source of truth:** `apps/api-gateway/src/subscriptions/store-milk-grid.service.ts`
**Rendering:** `apps/admin-dashboard/src/components/MilkDeliveryGrid.tsx`

---

## 1. The endpoints

```text
GET /api/store/subscriptions/dispatch-summary?date=YYYY-MM-DD
GET /api/store/subscriptions/grid?year=YYYY&month=MM
GET /api/store/subscriptions/grid/export-csv?year&month
GET /api/rider/delivery-runs/route-board?date=YYYY-MM-DD      (rider-scoped)
```

`dispatch-summary` response:

```jsonc
{
  "date": "2026-10-08",
  "summary": {
    "totalBuffaloMilkLiters": 12,
    "totalCowMilkLiters": 4.5,
    "totalMilkLiters": 16.5,
    "totalStops": 18,          // rows counted
    "completedStops": 7,       // rows with status == DELIVERED
    "pendingStops": 11,        // totalStops - completedStops
    "cashToCollectPaise": 412500,
    "cashCollectedPaise": 157500
  },
  "stops": [
    { "stopNumber": 1, "deliveryId": "...", "customerName": "...",
      "phone": "...", "address": "...", "slot": "AM",
      "product": "0.5L BM", "extra": "+0.25L", "totalLiters": 0.75,
      "status": "ORDER_GENERATED", "cashDuePaise": 15000,
      "cashCollectedPaise": 0 }
  ]
}
```

---

## 2. The three numbers

```text
packed  = summary.totalMilkLiters
          = totalBuffaloMilkLiters + totalCowMilkLiters

sold    = Σ stop.totalLiters  for stops where stop.status === "DELIVERED"
          (derive this yourself — the API does not return it)

left    = packed - sold       (still pending today; add back anything the
                               rider returns rather than delivers)
```

`completedStops` is the **count** of sold stops, not the volume. If plan sizes
differ across customers, `completedStops / totalStops` will not equal
`sold / packed` — do not treat them as interchangeable.

**Cash pairing (must agree):**

```text
cashToCollectPaise  = Σ cashDuePaise      (all stops)
cashCollectedPaise  = Σ cashCollectedPaise (all stops)
outstanding         = cashToCollectPaise - cashCollectedPaise  (>= 0)
```

---

## 3. How each stop's litres are computed

```text
stopLiters = baseQty + extraLiters          (0 when the row is SKIPPED)
```

### 3.1 `baseQty` — `resolveBaseLiters()`

1. From the subscription's `itemsSnapshot[0]`:
   - `weightGrams <= 300` → `0.25`
   - `weightGrams <= 600` → `0.5`
   - otherwise fall through to (2)
   - if no weight, try `extractWeightGramsFromName(name)`
2. From the plan **name**, only if step 1 was inconclusive:
   - contains `0.25` / `250` / `1/4` → `0.25`
   - contains `0.5` / `500` / `1/2` → `0.5`
   - else → `1.0`
3. **Override:** if `priceSnapshot.splitItems` exists, it wins:
   - `slot === 'AM'` → `parseVolumeLiters(splitItems.amQuantity || '0.5L')`
   - else (`PM`) → `parseVolumeLiters(splitItems.pmQuantity || '1L')`
   - a parse failure falls back to the value from step 2.

### 3.2 BM vs CM

```text
plan.name.toLowerCase() contains 'buffalo' or 'bm'  -> Buffalo (BM)
otherwise                                            -> Cow (CM)
```

A cow-milk plan whose name happens to contain `bm` in another word will be
mis-bucketed. Check the plan name when BM+CM ≠ total.

### 3.3 `extraLiters` — add-ons

Add-ons are **not** a column; they are parsed out of the `deferredReason` and
`failureReason` label strings by `sumAddOnLiters()`. The stop echoes them as
`extra: "+0.25L"`.

> **Regression guard:** `defaultExtraPricePaise` had used `extraQty.includes('2')`
> to detect 2 L, which read `0.25L` as *two* litres and charged ₹160 instead of
> ₹20. Volume now comes from `parseVolumeLiters`. If you see a 0.25 L add-on
> priced at ₹160, this bug is back.

---

## 4. Which rows are counted

`dispatch-summary` **includes** a `SubscriptionDelivery` when:

- `serviceDate` is inside the requested UTC day,
- the customer is `isActive`,
- the subscription status is **not** `COMPLETED`,
- the delivery status is **not** `SKIPPED` and **not** `CANCELLED`.

Consequences to assert:

- **A customer skip must not change `packed`.** Skipped/cancelled occurrences
  contribute `0` litres and are excluded from the query. Historically a skip
  inflated the store's daily stop *and* litre totals
  (`store-milk-grid.service.ts` and `MilkDeliveryGrid.tsx` both carry comments
  about this).
- **A COMPLETED subscription drops out of the day entirely** — an old plan must
  not still contribute litres to today's prep.
- **An inactive customer drops out.**
- `totalStops` counts rows *after* those filters, so skipping one customer
  reduces both `totalStops` and `totalMilkLiters`.

The rider prep demand is required to match this definition — see
`delivery-run-planning.service.ts` ("Prep demand must match dispatch-summary's
definition of milk to pack") and the
`milk-to-prep-consistency.contract.spec.ts` contract.

---

## 5. Reading the grid itself

`MilkDeliveryGrid` fetches the monthly matrix and **parses each cell label to
recover litres**:

- unit detection accepts `l | lt | ltr | liter | liters | litre | litres | ml`
- fractions are handled first: `1/4 L`, `1/2 (ltr)` → `0.25`, `0.5`
- then decimal/integers: `0.75L`, `2L`
- `null` means the label carries no volume (a money-only cell)

A cell whose label is money but which the parser reads as volume (or vice
versa) is a rendering bug — compare the cell against
`GET /store/subscriptions/customer/:id/statement` for that subscription.

---

## 6. Money assertion — the trap that has bitten before

Subscription cash lives in **two places that can drift**:

1. the ledger: `CustomerSubscription.amountCollectedPaise` / `amountDuePaise`
2. the day cells: `SubscriptionDelivery.cashCollectedPaise`

Readers must go through `reconcileSubscriptionBalance`
(`apps/api-gateway/src/subscriptions/subscription-balances.ts`), which treats
the ledger as a floor and absorbs missing day-cell cash. **Never read the raw
columns for a "Paid" figure** — that produced a grid row showing `Paid ₹50`
next to a `₹130` cell for the same customer.

`dispatch-summary` sums the raw day-cell columns (`cashDuePaise`,
`cashCollectedPaise`), so its `cashToCollectPaise`/`cashCollectedPaise` pair is
a **day-cell view**, not a reconciled view. When the two disagree, the
reconciled helper is authoritative — report the discrepancy, do not "fix" the
number by editing one side.

Also enforced: `amountDuePaise >= 0` and `CodLedger.expectedAmountPaise > 0`
are CHECK constraints. Collecting more than the outstanding due rolls the
transaction back as an opaque HTTP 500 rather than a 4xx.

---

## 7. Test recipe

```powershell
$base = "https://aagaam.in/api"
$jar  = "$env:TEMP\aagam-store.jar"
$date = "2026-10-08"

$s = curl.exe -s -b $jar "$base/store/subscriptions/dispatch-summary?date=$date" | ConvertFrom-Json

$packed = $s.summary.totalMilkLiters
$sold   = ($s.stops | Where-Object { $_.status -eq 'DELIVERED' } |
           Measure-Object -Property totalLiters -Sum).Sum
if ($null -eq $sold) { $sold = 0 }
$left   = $packed - $sold

"packed=$packed sold=$sold left=$left"
"stops  = $($s.summary.completedStops)/$($s.summary.totalStops)"
"cash   = collected $($s.summary.cashCollectedPaise) / due $($s.summary.cashToCollectPaise)"
```

### Assertions

| # | Assertion |
|---|---|
| G1 | `totalMilkLiters == totalBuffaloMilkLiters + totalCowMilkLiters` |
| G2 | `pendingStops == totalStops - completedStops` |
| G3 | `0 <= sold <= packed` (equal when every stop is delivered) |
| G4 | `left == packed - sold`, and `left == 0` only when `completedStops == totalStops` |
| G5 | skipping a customer changes `totalStops` and `totalMilkLiters` by exactly that customer's volume, and `completedStops` only if they were delivered |
| G6 | a `COMPLETED` or inactive-customer subscription contributes nothing |
| G7 | `cashToCollectPaise >= cashCollectedPaise`, and the difference matches the day cells' outstanding |
| G8 | rider prep demand (`delivery-run-planning`) equals `dispatch-summary.totalMilkLiters` for the same date |
| G9 | every delivered stop's `Order` reads `DELIVERED` — a sold litre with a non-delivered order is a status-coherence bug |

---

## 8. Related UI quick actions

On a grid cell the store can run: `TOGGLE_DELIVERED`, `SKIP`, `EXTRA_MILK`,
`TOGGLE_SLOT`, `RECORD_PAYMENT`, `VOID_PAYMENT`, `ATTACH_EVENING_MILK`.

Each of these is a mutation with money or volume side effects — confirm scope
with the user before firing one during a read-only test pass.

---

## 9. Where this appears in the UI (and what it does *not* show)

Two surfaces, both on `/store/subscriptions`:

1. **Today's Route Checklist bar** (green) — `Completed: <deliveredStops> /
   <totalStops>` and `Total Pack: <totalLiters> L`.
2. **Pack Summary** button → *Morning Packing & Dispatch Sheet* modal —
   `BUFFALO MILK (BM)`, `COW MILK (CM)`, `TOTAL PACK LITERS`, then
   `Route Delivery Stops (N)` / `Completed: M`, then the per-stop list with
   each stop's `product` and `status`.

Both agree with `dispatch-summary` exactly. **Neither shows sold litres or
remaining litres** — `todayStats` sums volume over *all* non-skipped stops
(packed) and counts delivered stops without summing their volume. See
`bug-register.md` BUG-005. Until it is fixed, compute sold/left yourself with
the recipe in §7.

**Pack Summary is intentionally today-only:** it calls
`/store/subscriptions/dispatch-summary` with no `date` parameter, so it always
summarises today regardless of the month the grid is showing. Not a bug.

### Last verified

- **2026-10-08**, live revision `2be0cfb6`.
- `2026-10-08` — packed `20.25 L` (BM `19.25` + CM `1.00`), stops `37`,
  completed `0`, sold `0 L`, left `20.25 L`, cash due `₹225.00` / collected
  `₹0`.
- `2026-10-07` — packed `20.00 L` (BM `19.25` + CM `0.75`), stops `36`,
  completed `0`, sold `0 L`, left `20.00 L`.
- `2026-10-06` — packed `18.50 L` (BM `18.25` + CM `0.25`), stops `33`,
  completed `0`, sold `0 L`, left `18.50 L`.
- `2026-10-05` — packed `18.75 L` (BM `18.25` + CM `0.50`), stops `34`,
  completed `1`, sold `0.25 L`, left `18.50 L`.
- `2026-10-04` — packed `18.50 L` (BM `18.25` + CM `0.25`), stops `33`,
  completed `0`, sold `0 L`, left `18.50 L`.
- **G1, G2, G4 and G7 passed on all five dates.** G3 holds trivially
  (`0 ≤ sold ≤ packed`). G5, G6, G8 and G9 were not exercised in this pass —
  no skip, completed plan, prep-demand or delivered-order mutation was run.
- Report any date here when you assert it, and strike through nothing: keep
  the history.
