# AAGAM bug register

Append-only record of defects found while testing. This file **lives in the
repository on purpose**: it is how the next agent avoids rediscovering a known
problem, and how a regression is recognised as a regression.

**How to use it**

1. Read it *before* testing — open entries are the first thing to re-test.
2. Add one entry per distinct defect. Never merge two defects into one entry.
3. When a defect is fixed, **edit the existing entry's status and evidence** —
   do not append a duplicate.
4. Evidence is mandatory: exact route or API call, observed value, expected
   value, and the code path. A bug without all four is a note, not a bug.

**Statuses:** `OPEN` · `FIXED-NOT-DEPLOYED` · `FIXED-DEPLOYED` · `NOT-A-BUG` ·
`WON'T-FIX` · `NEEDS-REPRO`

**No credentials, tokens, customer phone numbers or addresses in any entry.**
Reference records by order code (`JFS8M0RE`-style) or by DB id prefix only.

---

## Template

```markdown
### BUG-NNN — <one-line summary>

- **Found:** YYYY-MM-DD by <agent/session>
- **Severity:** blocker | major | minor | cosmetic
- **Surface:** /route or METHOD /api/path
- **Role:** customer | store | rider | admin | api
- **Status:** OPEN
- **Repro:**
  1. …
- **Observed:** …
- **Expected:** …
- **Code path:** `file:line` (when localised)
- **Evidence:** revision tested, response body / screenshot reference
- **Fix:** commit / PR, or "—"
- **Notes:** regressions it was confused with, tests that cover it
```

---

## Register

### BUG-001 — Rider pickup page rendered only one parcel, permanently blocking handoff of every other

- **Found:** 2026-10-08
- **Severity:** blocker
- **Surface:** `/rider/pickup`
- **Role:** rider
- **Status:** `FIXED-DEPLOYED` (commit `cb1e85fc`, pushed to `main`)
- **Repro:**
  1. Create two `RIDER_AT_STORE` delivery jobs for the same rider.
  2. Log in as the rider and open **Pickup Tasks**.
  3. The second job never appears, so its checklist can never be verified.
  4. As the store, open `/store/pickup-proof` and click **Confirm handoff**.
- **Observed:** page rendered exactly one task. `Confirm handoff` failed with
  `The Rider item and parcel checklist must be verified before handoff`.
  The blocked job (`JFS8M0RE`, `createdAt …29.438`) sorted *after* the other
  (`9ELFV5HT`, `createdAt …29.404`), and both had `deliveryWindowEnd: null`, so
  the `createdAt asc` ordering pinned the wrong job first **forever** — no
  amount of waiting or page reload could reach the second parcel.
- **Expected:** every pickup task for the rider is reachable, so each parcel can
  be verified and handed off.
- **Code path:** `apps/api-gateway/src/riders/rider-portal.service.ts` —
  `pickup()` returned `pickups()[0]`; `apps/admin-dashboard/src/app/(rider)/rider/pickup/page.tsx`
  fetched `/riders/portal/pickup` and rendered only that entry.
- **Evidence:** revision `2be0cfb6` on live; store handoff 409/400 message
  above; queue showed two `RIDER_AT_STORE` jobs.
- **Fix:** `cb1e85fc` — page now fetches `GET /riders/portal/pickups` and
  renders a task selector that scopes the checklist, problem report and handoff
  controls to the selected job. `STORE_PICKUP_PIN` behaviour preserved. Lint
  clean; `phase4-rider-portal` + `phase5-delivery-proof-cod-failures` 19/19.
- **Notes:** backend `assertPickupChecklist()` is correct and stays. Test
  ordering by setting distinct `deliveryWindowEnd` values rather than relying
  on `createdAt`.

### BUG-002 — Rider home tells the rider to wait for the store while the store is blocked on the rider

- **Found:** 2026-10-08
- **Severity:** major (it is the visible half of BUG-001's deadlock)
- **Surface:** `/rider`
- **Role:** rider
- **Status:** `OPEN`
- **Repro:**
  1. Put a job at `RIDER_AT_STORE` with `riderPickupTask.status = PENDING`.
  2. Log in as the rider and view the current delivery card.
- **Observed:** card reads **"At store"** with the instruction
  *"Wait for the store to verify parcel handoff."*
- **Expected:** an instruction that names the rider's own next step, e.g.
  *"Open Pickup Tasks and verify the item checklist so the store can hand the
  parcel over."* The store's **Confirm handoff** button is rejected until the
  rider verifies, so the rider is being told to wait on an action that will
  never happen without them.
- **Code path:** rider home/portal payload that maps `RIDER_AT_STORE` to the
  "at store" instruction — audit
  `apps/api-gateway/src/riders/rider-portal.service.ts` and the `/rider` page's
  status→instruction map.
- **Evidence:** revision `2be0cfb6`; observed in the browser alongside BUG-001.
- **Fix:** FIXED in the working tree, **not yet deployed** — `RIDER_AT_STORE`
  help text now reads *"Open Pickup Tasks and verify the item checklist so the
  store can hand the parcel over."* and an amber banner with an **Open Pickup
  Tasks** link to `/rider/pickup` was added
  (`apps/admin-dashboard/src/app/(rider)/rider/page.tsx`, `statusMeta` and the
  active-job banner). Verified locally (lint + `tsc` clean); live still serves
  the old copy at revision `c8dc8a0c`, so re-check after the next `main` deploy.
- **Notes:** This is a copy/ordering defect, not a state-machine defect. The
  state machine is right; the guidance is wrong. Pair the fix with a link to
  `/rider/pickup`.

### BUG-003 — Store pickup-proof page silently drops a handed-off job while the queue still lists it

- **Found:** 2026-10-08
- **Severity:** minor
- **Surface:** `/store/pickup-proof`
- **Role:** store
- **Status:** `NOT-A-BUG` (recorded so it is not re-filed)
- **Repro:**
  1. Confirm a handoff for a `COD` job.
  2. Reload `/store/pickup-proof`; the card is gone.
  3. `GET /api/orders/delivery-operations/queue` still returns the job with
     `inQueue: true`.
- **Observed:** UI and API disagree about presence.
- **Expected:** correct as built. The page filters `job.status ===
  "RIDER_AT_STORE"` because the card's only purpose is to perform the handoff;
  once `PICKUP_VERIFIED` there is nothing left to act on. COD settlement is
  tracked elsewhere.
- **Code path:** `apps/admin-dashboard/src/app/(store)/store/pickup-proof/page.tsx:26`
- **Notes:** Recorded because it reads exactly like a data-loss bug during
  testing. A future enhancement could render a read-only "handed off" row, but
  the current behaviour is intended.

### BUG-004 — Dependency Security Audit gate is red on every push and does not block deploys

- **Found:** 2026-10-08
- **Severity:** major (a security gate that is permanently red is equivalent to no gate)
- **Surface:** `.github/workflows/dependency-security-audit.yml` / `scripts/verify-dependency-security.js`
- **Role:** repo / CI
- **Status:** `OPEN`
- **Repro:**
  1. `node scripts/verify-dependency-security.js` from the repo root.
  2. Exit code `1`, printing `Unmitigated npm advisories remain:`.
- **Observed:** the `Dependency Security Audit` workflow concludes `failure`
  for `cb1e85fc` (2026-10-08) **and** for the previous push `be166f61`
  (2026-10-05) — so it is pre-existing and independent of any application-code
  change. Unmitigated advisories reported locally include:
  - `jest` / `@jest/*` / `babel-jest` / `react-native` and friends — **high**,
    `https://github.com/advisories/GHSA-vfj7-8cjw-p6xm`
  - `next` — **moderate**, `GHSA-4jqv-mc3x-m676`, `GHSA-mcj8-r9mp-w47p`
  - `tailwindcss`, `postcss-nested`, `postcss-selector-parser` — **high**,
    `GHSA-rj75-hqrm-r3gf`
  - `js-yaml`, `argparse`, `sprintf-js`, `@istanbuljs/load-nyc-config`,
    `babel-plugin-istanbul` — **moderate**, `GHSA-hp3w-g68c-fv3c`
  None of these URLs are on the reviewed allow-list that
  `verify-dependency-security.js` accepts.
- **Expected:** `npm audit` clean and the workflow green, per `AGENTS.md`
  ("`npm audit` must be clean").
- **Code path:** root `package.json` `overrides` (each pinned fix is scoped to
  its parent package) + the allow-list inside
  `scripts/verify-dependency-security.js`.
- **Evidence:** GitHub Actions — `Dependency Security Audit` run for
  `cb1e85fc` and `be166f61`, both `completed / failure`; local script exit `1`.
- **Fix:** FIXED in the working tree, **not yet deployed** — the scoped root
  `overrides` were bumped (`next` 15.5.27, `postcss-selector-parser` 7.1.6,
  `sharp` 0.35.5) and the `sprintf-js` allow-list entry re-added in
  `scripts/verify-dependency-security.js`; the UUID override probe was rewritten
  to resolve the package entry point (gaxios' restrictive `exports` blocked
  `package.json`). Locally `node scripts/verify-dependency-security.js` exits `0`
  (*"no unmitigated npm advisory remains"*) and
  `node scripts/test-google-uuid-security-override.js` exits `0`
  (gaxios + teeny-request resolve uuid 11.1.1). Live CI is green once pushed.
  Original candidate path (retained for reference): bump the scoped `overrides`,
  then re-run the script; remember overrides only
  apply on a fresh resolve, i.e. delete `node_modules` **and**
  `package-lock.json` before reinstalling. Add an allow-list entry only for a
  transitive advisory with genuinely no in-range fix, with the chain and the
  patched version commented.)
- **Notes:** `deploy.yml` triggers on the **CI** workflow's success, not on
  this one, so a red security gate does **not** stop a production deploy —
  which is exactly why it can sit unnoticed. Recorded here so the next agent
  does not mistake it for something its own change caused.

---

### BUG-005 — Store grid shows packed litres but never shows sold or remaining litres

- **Found:** 2026-10-08
- **Severity:** minor (a routine operator question has no UI answer, though the
  data to answer it is already on the wire)
- **Surface:** `/store/subscriptions` — the *Today's Route Checklist* bar and the
  **Pack Summary** modal
- **Role:** store
- **Status:** `OPEN`
- **Repro:**
  1. Log in as the store → `/store/subscriptions`.
  2. Read the green *Today's Route Checklist* bar: it shows
     `Completed: 0 / 37` and `Total Pack: 20.25 L`.
  3. Click **Pack Summary** → *Morning Packing & Dispatch Sheet*.
  4. Look for "sold" and "left/remaining" litres.
- **Observed:** the grid answers *"how much did the rider leave with"* but not
  *"how much sold"* or *"how much is left"*:
  - Pack Summary modal: `BUFFALO MILK (BM) 19.25 L`, `COW MILK (CM) 1 L`,
    `TOTAL PACK LITERS 20.25 L`, `Route Delivery Stops (37)`,
    `Completed: 0`, then a per-stop list carrying `product` + `status`.
  - The checklist bar gives `Completed` as a **stop count** (`0 / 37`) next to
    `Total Pack` as a **volume** (`20.25 L`) — so the two headline numbers are
    in different units and cannot be combined.
  - `todayStats` accumulates `liters` over **every** non-skipped stop (i.e.
    packed) and increments `delivered` only as a counter; there is no
    delivered-volume or remaining-volume accumulator.
  - A repo-wide grep for `soldLitres|leftLiters|packedLiters|remainingLitres`
    returns zero matches — no surface computes either number.
- **Expected:** three figures side by side, since that is the end-of-day
  question —
  `packed = totalMilkLiters` · `sold = Σ stop.totalLiters where status == DELIVERED` ·
  `left = packed − sold`. Worked example for `2026-10-05`:
  packed `18.75 L`, sold `0.25 L`, left `18.50 L`, `1/34` stops delivered.
- **Code path:**
  - `apps/admin-dashboard/src/components/MilkDeliveryGrid.tsx:680-705` —
    `todayStats` has no `deliveredLiters` / `remainingLiters`.
  - `:1414-1423` — checklist bar renders only `deliveredStops / totalStops`
    and `totalLiters`.
  - `:2745-2765` — Pack Summary metric cards and `Completed: {completedStops}`.
  - Data source is already sufficient:
    `apps/api-gateway/src/subscriptions/store-milk-grid.service.ts:1203-1216`
    returns per-stop `totalLiters` **and** `status`, so **the API needs no
    change** — only the aggregation and the labels are missing.
- **Evidence:** live revision `2be0cfb6` (deploy of `cb1e85fc` was in progress
  during the test). Values read from
  `GET /api/store/subscriptions/dispatch-summary?date=2026-10-08` and matched
  the modal exactly: BM `19.25`, CM `1`, total `20.25`, stops `37`,
  completed `0`, cash due `22500` paise, collected `0`.
- **Fix:** FIXED in the working tree, **not yet deployed** — `todayStats` in
  `apps/admin-dashboard/src/components/MilkDeliveryGrid.tsx` now accumulates
  `soldLiters` (Σ litre-count of `DELIVERED` cells) and `leftLiters`
  (`packed − sold`), and the route checklist renders **Packed / Sold / Left**
  as three equal cards. Unit-tested via `resolveRunActions`/`mergeRunIntoOpenStop`
  is separate; the grid aggregation is UI-only. Live still serves `c8dc8a0c`.
- **Notes:** **Pack Summary is deliberately today-only** — it calls
  `/store/subscriptions/dispatch-summary` with no `date` parameter and the
  loading copy says *"Calculating today's milk procurement demand"*. It
  therefore ignores which month the grid is navigated to. That is intended;
  do **not** file it as a separate bug.

---

### BUG-006 — Delivery-job summary leaks the assigned rider's bcrypt password hash and bank ciphertext to the customer

- **Found:** 2026-10-08 by aagam-testing (delivery completion pass)
- **Severity:** major (sensitive-data exposure on a shared endpoint; cross-role, not just the rider's own data)
- **Surface:** `GET /api/orders/delivery-operations/jobs/:deliveryJobId/summary`
- **Role:** api (customer, store, rider, admin all reach it)
- **Status:** OPEN
- **Repro:**
  1. Log in as any role (customer, store, rider or admin) with any cookie jar.
  2. `GET /api/orders/delivery-operations/jobs/:id/summary` for a job whose
     order `customerId` equals the caller.
  3. Read `job.currentRider.user`.
- **Observed:** `job.currentRider.user` is the **entire** `User` row (`include: { user: true }`),
  including `password` (a live bcrypt hash, `$2b$10$…`), `fcmToken`, `googleSub`,
  `deactivatedAt`, `deactivationReason`. `job.currentRider` on the *same* response
  also carries `bankAccountCiphertext` and `bankIfscCiphertext`.
- **Expected:** only fields the caller needs (id, name, phone/avatar). A rider's
  password hash must never be serialised. The queue endpoint
  (`getQueue`) already does this correctly — it uses
  `currentRider: { include: { user: { select: {id,name,email,phone} } } }`.
- **Code path:** `apps/api-gateway/src/orders/delivery-operations.service.ts`
  `private async job()` (~line 313) —
  `include: { currentRider: { include: { user: true } }, … }`. The sibling
  `getQueue()` (~line 535) uses a `select`, proving the intended shape.
- **Evidence:** live revision `41daf15c` (app code == `cb1e85fc`; only `skills/`
  changed between them). A `GET .../summary` as the customer whose order it was
  returned HTTP 200 with `"$2b$"` and `bankAccountCiphertext` present in the body.
  Beyond this job, `getQueue()` is store/admin-only and its 48 rows already expose
  the same ciphertexts, so any store owner can decrypt rider bank details offline
  once they hold the key — this entry covers the `summary` leak specifically.
- **Fix:** — (candidate: replace `include: { user: true }` on `currentRider` with
  an explicit `select` mirroring `getQueue()`, and drop or `select`-scope the
  bank columns.)
- **Notes:** Not in `skills/` scope; recorded here because it surfaced while
  asserting the delivery summary. Do not paste the hash anywhere.

### BUG-007 — Delivery-job summary reports `cod.collected: false` after a rider-photo COD delivery already collected the cash

- **Found:** 2026-10-08 by aagam-testing (delivery completion pass)
- **Severity:** minor
- **Surface:** `GET /api/orders/delivery-operations/jobs/:id/summary` → `cod.collected`
- **Role:** rider (mobile partner app) / store / admin
- **Status:** OPEN
- **Repro:**
  1. Complete a subscription delivery whose stop proof mode is `RIDER_PHOTO_GPS`
     with `cashCollectedPaise = cashDuePaise` (the run-stop complete path, e.g.
     `POST /api/rider/delivery-runs/:runId/stops/:stopId/complete`).
  2. `GET .../jobs/:id/summary`.
- **Observed:** `cod.collected: false` even though the ledger shows the cash is in
  hand — `cod.ledger.collectedAmountPaise = 500`, `riderHoldingBalancePaise = 500`,
  `status: HELD_BY_RIDER`, and `rider/delivery-runs` `collectedCashPaise = 500`.
  `requirements.codCollectionRequired` is still `true`.
- **Expected:** `cod.collected` mirrors the ledger once the cash is collected.
- **Code path:** `apps/api-gateway/src/orders/delivery-operations.service.ts`
  `getSummary()` (~line 452) derives `collected` only from an `operations` row of
  type `COD_COLLECTED` + `COMPLETED`, which is written exclusively by
  `completeCodDelivery()` (`collectCod` / the OTP branch of run-stop complete).
  The `RIDER_PHOTO_GPS` branch of `delivery-run-operations.service.ts` `complete()`
  (~line 335-400) updates `codLedger` + writes a `CodLedgerEntry(COLLECTED)` but
  never creates the `DeliveryOperation(COD_COLLECTED)`, so the summary's
  operation-derived flag stays false.
- **Evidence:** live revision `41daf15c`. Completed run
  `RUN-AAGA-AM-2026-10-08-f2ce` (run `cmuyuu8ik…`, stop `cmuyuu8kr…`,
  job `cmuyuu8ke…`, order `…jfs8m0re`); the run `finish` → `AWAITING_SETTLEMENT`,
  both stops `DELIVERED`, `collectedCashPaise 500`. Rider app consumes this flag:
  `apps/mobile-partners/src/domain/riderDeliveryFlow.ts:78` (`customerPaid` null
  when `collected` false) and `apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx:331`
  (the "COD collection recorded" strip never renders).
- **Fix:** — (candidate: have the photo/trusted-drop completion path also write the
  `COD_COLLECTED` operation, or make `getSummary()` fall back to
  `codLedger.collectedAmountPaise > 0`.)
- **Notes:** The money itself is correct; this is a status-flag/UI divergence, not
  a cash discrepancy. Distinct from BUG-003 (`inQueue` vs page filter).

### BUG-008 — Rider stop modal keeps stale state after `arrive()`, so the photo/GPS and cash controls stay hidden

- **Found:** 2026-10-08 by aagam-testing (rider run completion pass)
- **Severity:** major
- **Surface:** Rider portal, `aagaam.in/rider/runs` → open a stop → "I have arrived"
- **Role:** rider
- **Status:** OPEN
- **Repro:**
  1. Open a run that is `IN_PROGRESS` and tap an `ARRIVED`/`READY` stop card to
     open the in-flight stop panel.
  2. Record arrival (`POST /rider/delivery-runs/:runId/stops/:stopId/arrive`).
  3. Without closing the panel, look for the "Delivery Photo & Location Proof"
     uploader and "Cash Collected (₹)" input.
- **Observed:** they are **absent**. The panel still renders the pre-`arrive()`
  stop object, so the completion form has nothing to bind its evidence/cash
  inputs to. Closing the panel and re-opening the same stop renders the full
  form (photo uploader + cash field + "Verify and complete this stop"). A rider
  who follows the natural sequence — arrive, then complete in the still-open
  panel — hits a dead end and cannot complete the delivery.
- **Expected:** the completion form appears as soon as the stop reaches
  `ARRIVED`, without a manual close/reopen.
- **Code path:** `apps/admin-dashboard/src/app/(rider)/rider/runs/page.tsx`.
  `arrive()` (line 452) POSTs and then `await loadRuns()` (line 475), which
  replaces `activeRun` but never re-seeds `selectedStop`; the panel at line 1284
  reads `selectedStop` (a stale snapshot from when the card was clicked), so its
  derived status stays pre-arrival.
- **Evidence:** live revision `41daf15c`. Run `cmuz9pz8i1zh3672nr6qpjs6x`
  (`RUN-AAGA-PM-2026-10-08-f2ce`), stop `cmuz9pz971zhe672nv9j46m8f`, job
  `cmuz9pz8x1zha672nmzvmlync`. Step 2 screenshot showed the panel without the
  photo/cash controls; after close+reopen (step 3) they rendered. See
  `agent_demo_shots/02_…` (dead-end) vs `03_…` (reopened). The modal is
  per-stop, so this only blocks the *first* completion attempt on each stop that
  is still open when arrival is recorded.
- **Workaround:** close and re-open the stop panel after arriving (recorded in
  `references/flows.md` Flow G).
- **Fix:** FIXED in the working tree, **not yet deployed** — `loadRuns()` now
  re-seeds the open panel via the shared `mergeRunIntoOpenStop` helper
  (`packages/utils/src/store-run.ts`, consumed by
  `apps/admin-dashboard/src/app/(rider)/rider/runs/page.tsx`), so the fresh
  `ARRIVED` stop is merged over the snapshot and the photo/GPS + cash form
  renders without closing the panel. Covered by
  `apps/api-gateway/src/subscriptions/store-run-actions.spec.ts`
  (`rider open stop refresh`). Live still serves the stale-snapshot build at
  `c8dc8a0c`.
- **Notes:** the original candidate fix (set `selectedStop` from the
  `loadRuns()` payload, or re-derive the panel from
  `activeRun.stops.find(s => s.id === selectedStop.id)`) is what the shared
  helper now encapsulates for both consumers.

### BUG-009 — Same-day "Dispatch to Rider" skips packing and auto-marks the store handoff, so `packedBagCount` stays 0

- **Found:** 2026-10-08 by aagam-testing (store packing pass)
- **Severity:** minor
- **Surface:** Store portal "Prep list" → route row → buttons
- **Role:** store owner
- **Status:** OPEN
- **Repro:**
  1. Create a same-day subscription delivery and dispatch it from the store grid
     ("Dispatch to Rider", `POST /store/subscriptions/dispatch-to-rider`).
  2. In the store's Prep list, find the row for the run the dispatch created.
- **Observed:** the row shows only **Handoff**; the **Pack** button is never
  rendered, and the run's `packedBagCount` stays `0` while `expectedBagCount`
  is `> 0`. The dispatch already stamped `storeHandoffConfirmedAt`, so the run
  is `READY_FOR_PICKUP` (handed off) despite the store never having confirmed a
   bag count. The packing endpoint itself (`POST
  /store/subscription-operations/runs/:runId/packing`) accepts the run — it was
   applied via API to unblock the test — proving this is a UI-only gate.
- **Expected:** either the dispatch path also records the store's packed-bag
  confirmation, or a dispatch-created run keeps a packable state so the store
  can verify bags before handoff.
- **Code path:** `apps/admin-dashboard/src/app/(store)/store/subscriptions/page.tsx`
  line 1155 — the Pack button renders `{run.status === "PLANNED" && …}`, and the
  Handoff button renders `{run.status === "READY_FOR_PICKUP" && …}`.
  `apps/api-gateway/src/subscriptions/store-milk-grid.service.ts`
  `dispatchToRider()` creates the run with `status: 'READY_FOR_PICKUP'` and
  `storeHandoffConfirmedAt: new Date()` (comment: "the store's handoff is
  implicit in this dispatch action"), so a dispatch-created run never passes
  through `PLANNED`.
- **Evidence:** live revision `41daf15c`. Run `cmuz9pz8i1zh3672nr6qpjs6x`:
  `expectedBagCount 2`, `packedBagCount 1` after the API packing call,
  `storeHandoffConfirmedAt` set at dispatch. Rider bag receipt then requires an
  exact bag count (`"Verify exactly N route bags before pickup"`), which the
  store was never asked to confirm through the UI.
- **Fix:** — (candidate: gate the Pack button on `!storeHandoffConfirmedAt`
  instead of `status === 'PLANNED'`, or have `dispatchToRider` leave the run
  `PLANNED` until the store confirms both bag count and handoff.)

### BUG-010 — A partial COD payment on one delivery is not carried into the subscription's outstanding balance

- **Found:** 2026-10-08 by aagam-testing (partial-payment delivery pass)
- **Severity:** minor
- **Surface:** Rider stop completion with a cash amount below the amount due
- **Role:** rider → customer/store
- **Status:** OPEN
- **Repro:**
  1. Complete a `RIDER_PHOTO_GPS` stop with `cashCollectedPaise` **less than**
     `cashDuePaise` (e.g. collect ₹60 of ₹105; submit `cashCollected: 60`),
     `POST /rider/delivery-runs/:runId/stops/:stopId/complete`.
  2. Read the subscription's `amountDuePaise` / `amountCollectedPaise` and the
     delivery's `cashDuePaise` / `cashCollectedPaise`.
- **Observed:** the ₹45 shortfall vanishes from the subscription ledger. The
  subscription reads `ACTIVE`, `amountCollectedPaise 6000`, `amountDuePaise
  4500`, but the day cell keeps its full `cashDuePaise 10500` with only
  `cashCollectedPaise 6000` applied to it. The subscription-level "Pending"
  therefore reflects one funding cycle's contracted total, not this delivery's
  unpaid cash — the ₹45 collected short is not surfaced as a balance to
  re-collect and does not roll into the next funding cycle. The customer shop
   shows "Pending ₹45.00", which happens to look right by coincidence
   (₹105 − ₹60), not because the shortfall was carried.
- **Expected:** an under-collection either stays visible on the delivery/ledger
  as an amount to recover, or is explicitly written off; it should not disappear
  when the funding cycle is next allocated.
- **Code path:** `apps/api-gateway/src/subscriptions/delivery-run-operations.service.ts`
  `complete()` decrements the ledger by the cash actually collected
  (`amountDuePaise: { decrement: cashCollected }`, ~line 357) while the day cell
  keeps its `cashDuePaise`; the funding allotter
  `subscription-cash-funding.service.ts` `allocateAfterCodCollectionWithinTransaction`
  then sets `amountDuePaise: 0` and `remainingFundedDeliveries += fundedDeliveryCount`
  on the next allocation, so any residual from an under-collected day is dropped
  rather than deducted from the funded window.
- **Evidence:** live revision `41daf15c`. Subscription `cmuz9py9b1zgr672n4h2nio61`
  (`Cow Milk 1/4L 7 Days`), delivery `cmuz9py9g1zgs672ng8fprh83`, stop
  `cmuz9pz971zhe672nv9j46m8f`. After collecting ₹60 on a ₹105 day: customer
  `GET /customer/subscriptions/:id` → `amountCollectedPaise 6000`,
  `amountDuePaise 4500`; delivery kept `cashDuePaise 10500`,
  `cashCollectedPaise 6000`; COD ledger `HELD_BY_RIDER` 6000, run finish →
  `AWAITING_SETTLEMENT`. `reconcileSubscriptionBalance` cannot close the gap
  because the day cell still advertises ₹105 expected.
- **Notes:** Distinct from the collection *guards* (which correctly reject
  over-collection and zero-due). This is the under-collection *carry-forward*
  path. A fully-paid run is unaffected and reconciles cleanly.
- **Fix:** FIXED in the working tree, **not yet deployed** —
  `allocateAfterCodCollectionWithinTransaction` no longer zeroes
  `amountDuePaise`; it recomputes the residual as the summed shortfall over
  delivered day cells that recorded partial cash (`cashCollectedPaise > 0`),
  so an under-collected day's shortfall survives the allocation while a
  fully COD-settled plan (cash lives on the ledger, not the cell) still
  reaches zero instead of double-counting the window just funded. Regression:
  `subscription-cash-funding.service.spec.ts` (carry-forward + no-phantom).


### BUG-011 — A route-partial run cannot be packed or handed off: the run-level action rejects a run whose already-delivered stops sit on the same route

- **Found:** 2026-10-08 by aagam-testing (delivery completion session)
- **Severity:** major (blocks the store/rider from finishing a route that still
  has stops to deliver, for as long as any one stop on it is already delivered)
- **Surface:** Store Prep list / rider run receipt — `POST
  /api/store/subscription-operations/runs/:runId/packing`; the same
  all-stops scan gates `.../runs/:runId/pickup`, rider
  `POST /api/rider/delivery-runs/:runId/pickup` and the dependent `.../start`
- **Role:** store owner / rider
- **Status:** OPEN (new)
- **Repro:**
  1. Take a route with more than one stop and complete delivery of any single
     stop (leave at least one other stop un-delivered). On live this is
     `RUN-AAGA-AM-2026-10-08-f2ce` (`cmuyuu8ikzilxdo7hc5el89k5`): stops 1 and
     2 are `DELIVERED`, stop 3 is `READY`.
  2. As the store owner, confirm run packing:
     `POST /store/subscription-operations/runs/cmuyuu8ikzilxdo7hc5el89k5/packing`
     with `{version, expectedBagCount:3, packedBagCount:3}`.
- **Observed:** `409 Conflict` — *"Run order cannot be packed from `DELIVERED`"*.
  The guard loops **every** stop and reads the **delivery job** status, which is
  `DELIVERED` for the stops already completed; a stale run whose
  `packedBagCount < expectedBagCount` can never be re-packed to satisfy the
  rider's exact-bag receipt, so the run never reaches `PICKED_UP`/`IN_PROGRESS`
  and its remaining stop cannot be delivered. On the same route the single-stop
  API path works (it validates only the one target stop), so this is a run-level
  bulk-action bug, not a stop-level one.
- **Expected:** run-level packing/handoff iterates only the stops that are not
  yet terminal; a `DELIVERED`/`FAILED`/`CANCELLED`/skipped stop should be
  ignored (or collected into a "already complete" list), not abort the whole
  route.
- **Code path:** `apps/api-gateway/src/subscriptions/delivery-run-planning.service.ts`
  `confirmPacking()` (~line 254): the `for (const stop of run.stops)` loop reads
  `order.status` and throws `Run order cannot be packed from ${order.status}`
  when the order is not in `[CONFIRMED, PICKING, PACKED, RIDER_ASSIGNED]` — a
  `DELIVERED` order trips it. The same loop shape appears in
  `confirmStoreHandoff()` (~line 310, throws
  *"Stop N is not ready for store handoff"*) and in
  `delivery-run-operations.service.ts` `confirmPickupReceipt()` /
  `start()` (~lines 98 / 143), all of which scan every stop and abort on a
  terminal one. The session's earlier `recordPayment` note (AGENTS.md) was
  about the *per-stop* path, which is the route that did work here.
- **Evidence:** live revision `c8dc8a0c`. Run `cmuyuu8ikzilxdo7hc5el89k5`,
  `READY_FOR_PICKUP`, `expectedBagCount 3`, `packedBagCount 2`; stop 3
  `cmuz9o8nj1you672nwc8h7hpf` is `READY` with job `cmuz9o8n11yoq672nw2u4gny8`
  (which I could not complete because the run could not be started). Packing
  call returned HTTP 409 with the message above; the same run's stop 3 was
  fully independent and completable. This is the AM twin of the PM run
  (`cmuz9pz8i1zh3672nr6qpjs6x`) where I could complete a stop because it was
  reached through the independent OTP/COD job path. (The PM run packing call
  returned the same 409 for the same reason.)
- **Fix:** FIXED in the working tree, **not yet deployed** — the four run-level
  loops now `continue` past a terminal stop (`DELIVERED`/`FAILED`/`RETURNED`/
  `CANCELLED`) via the shared `TERMINAL_RUN_STOP_STATUSES` set
  (`apps/api-gateway/src/subscriptions/run-stop-status.ts`) in
  `confirmPacking` / `confirmStoreHandoff`
  (`delivery-run-planning.service.ts`) and `confirmPickupReceipt` / `start`
  (`delivery-run-operations.service.ts`). A route with a delivered stop now
  packs and hands off its survivors. Regression:
  `delivery-run-planning-partial.e2e.spec.ts`.
- **Notes:** The lane is ambiguous from the store UI (one owner-facing "store"
  vs the two slot runs); this entry is about the run-level action, not the
  lane. Distinct from BUG-001 (rider pickup page renders one parcel) and
  BUG-009 (dispatch skips packing entirely) — this is a *packed* route whose
  later re-pack/handoff is blocked by an earlier delivered stop.


## Regression hot-spots

Defects that have already bitten once; re-check these whenever you touch the
area, and treat a recurrence as a **major** finding.

| Area | Past defect | Guard |
|---|---|---|
| Subscription money | Paid figure read from raw ledger disagreed with the day cell (₹50 vs ₹130) | `reconcileSubscriptionBalance` |
| Cash collection | Day cell incremented while ledger due was clamped → phantom Paid | collection guards on both writer paths |
| Rider workload | Empty delivery run pinned a rider `BUSY` forever | `isEmptyDeliveryRun` sweep + force-cancel |
| Skip/pause | Grid dropped the row but the rider board kept a live stop | `SubscriptionLifecycleService` teardown |
| Litre totals | A skip inflated daily stop **and** litre totals | `status notIn [SKIPPED, CANCELLED]` |
| Add-on pricing | `includes('2')` read `0.25L` as 2 L → ₹160 instead of ₹20 | `parseVolumeLiters` |
| Custom price | `extraPaise \|\| fallback` treated `0` as missing → billed ₹80 | `resolveExtraPaise` |
| Offline purge | Second purge hit the unique `User.email` constraint | per-customer placeholder email |
| Order status | Rider photo completion bypassed the workflow → order stuck `OUT_FOR_DELIVERY` | `transitionWithinTransaction` |
| Store subscribers | Raw array inflated the tab to 58 while the grid showed 36 | deduped `{subscribers, counts}` payload |
| Empty CI | ~604 `PrismaClientInitializationError` failures without `DATABASE_URL` | `AGENTS.md` test setup |
