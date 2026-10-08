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
- **Fix:** —
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
- **Fix:** — (candidate path: bump the scoped `overrides` — `jest`/`next`/
  `tailwindcss`/`js-yaml` — then re-run the script; remember overrides only
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
- **Fix:** — (candidate: accumulate `deliveredLiters` in `todayStats`, add
  `soldLiters`/`leftLiters` to the `dispatch-summary` `summary` object for
  non-today dates, then render *Packed / Sold / Left* as three equal cards.)
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
