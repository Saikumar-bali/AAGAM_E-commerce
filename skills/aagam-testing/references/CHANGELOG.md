# Skill changelog

Append-only. Never rewrite or delete a line — the history of *what the skill
believed and when* is the point. Newest entry last.

Each entry: date, version after the change, author (agent/session label or
human), what changed, why.

---

## Entries

- **2026-10-08 · v1.0.0 · initial creation**
  - Created `.commandcode/skills/aagam-testing/` as a self-contained
    directory: `SKILL.md`, `references/` (four reference files + this
    changelog) and `scripts/live-revision.ps1`. Everything the skill needs
    travels inside the skill; no path in any file escapes the skill directory
    except repo-relative code references.
  - `SKILL.md` — scope, hard rules (no credentials in the repo, read-first,
    evidence-backed findings, never claim a fix is live before the served
    revision contains it), orientation step, session guidance, condensed
    end-to-end chain, cross-cutting assertions, bug recording, self-update
    protocol, definition of done.
  - `references/flows.md` — UI-level flows for all four roles: customer
    subscribe → store assign → rider pickup checklist → store handoff →
    rider deliver → customer confirm (Flow A), store self-delivery (Flow B),
    store grid packed/sold/left (Flow C), rider operations loop (Flow D),
    admin oversight (Flow E), failure/return (Flow F); plus identity/ID
    conventions and known stall points.
  - `references/api.md` — env-var credential contract, `access_token` cookie
    login, per-role cookie jars, endpoint map for delivery-operations,
    rider-portal, store subscriptions, rider delivery-runs and admin;
    response-shape traps; deploy/revision rules.
  - `references/store-grid.md` — `dispatch-summary` semantics, how
    `baseQty` / BM-CM / add-on litres are derived from strings, which rows are
    counted, grid label parsing, the ledger-vs-day-cell money trap, a PowerShell
    test recipe and assertions G1–G9.
  - `references/bug-register.md` — template, status vocabulary, four seeded
    entries (BUG-001 blocker pickup selector `FIXED-DEPLOYED` `cb1e85fc`,
    BUG-002 major rider-copy `OPEN`, BUG-003 `NOT-A-BUG`, BUG-004 major
    permanently-red dependency security gate `OPEN`), and a regression
    hot-spot table drawn from `AGENTS.md`.
  - `scripts/live-revision.ps1` — compares `GET /api/health.revision` against
    `origin/main` and lists commits not yet live.
  - Credentials deliberately excluded: the skill reads role credentials from
    `AAGAM_*_EMAIL` / `AAGAM_*_PASSWORD` at runtime and tells the agent to ask
    the user when they are unset.
  - Repo wiring: `.gitignore` changed from ignoring all of `.commandcode/` to
    `.commandcode/*` + `!.commandcode/skills/`, so the skill is tracked while
    `.commandcode/design/` and other tool state stay local. `AGENTS.md` gained
    an **Agent skills** section so any model reading the repository finds the
    skill without being told where it is.

- **2026-10-08 · v1.1.0 · relocated to a tracked top-level `skills/` directory**
  - Moved `.commandcode/skills/aagam-testing/` → **`skills/aagam-testing/`**
    (seven files, `git mv`, history preserved).
  - Why: `.commandcode/` is this tool's own config/state directory and is
    gitignored by default, so the v1.0.0 wiring needed a `.gitignore`
    carve-out just to make the skill committable — and a dot-directory is
    hidden in a normal file listing, so a human browsing the repository would
    never find it. A top-level `skills/` is the convention used by public
    agent-skill repos, is self-advertising, and needs no tool-specific config
    for another model to read it.
  - `.gitignore` reverted to a plain `.commandcode/` rule; the carve-out is
    gone and `.commandcode/design/` stays local as before.
  - Path references updated in `SKILL.md` (live-revision invocation) and
    `references/api.md` (script location).
  - `AGENTS.md` → **Agent skills** now names `skills/<name>/` and explains why
    it is not a dot-directory.
  - Content unchanged: flows, assertions G1–G9, endpoint map and BUG-001…
    BUG-004 are identical to v1.0.0.

- **2026-10-08 · v1.1.1 · first real test pass: packed/sold/left in the store grid**
  - Ran the store-grid assertions against live revision `2be0cfb6` for five
    dates. **G1, G2, G4 and G7 passed** on all five; G3 holds trivially;
    G5/G6/G8/G9 were not exercised (no mutation run). Values recorded in
    `references/store-grid.md` §9 *Last verified*.
  - **BUG-005 opened (minor, `OPEN`)** — the store grid answers *"how much did
    the rider leave with"* (`Total Pack: 20.25 L`) but never answers *"how much
    sold"* or *"how much is left"*. `todayStats` sums volume over all
    non-skipped stops and counts delivered stops without summing their volume;
    a repo-wide grep for `soldLitres|leftLitres|remainingLitres` returns
    nothing. The API already returns per-stop `totalLiters` **and** `status`,
    so only the aggregation and labels are missing.
  - Also documented in `store-grid.md` §9: where the two pack surfaces live
    (checklist bar + **Pack Summary** modal), that both agree with
    `dispatch-summary` exactly, and that **Pack Summary is intentionally
    today-only** (no `date` parameter) — recorded so nobody files it as a bug.

- **2026-10-08 · v1.3.0 · first delivery-completion pass (Flow G)**
  - Actually completed one subscription delivery end-to-end on live revision
    `41daf15c` (`RUN-AAGA-AM-2026-10-08-f2ce`, run `cmuyuu8ik…`): store
    `packing` → store `pickup` → rider bag receipt → `start` → per-stop
    `arrive`/`complete` (the Rs 5 COD stop via upload-evidence + photo proof,
    the zero stop free) → `finish`. Final: 2/2 stops `DELIVERED`,
    `collectedCashPaise` 500 = `expectedCashPaise`, run `AWAITING_SETTLEMENT`.
    Assertions held: both orders `DELIVERED`, the cash subscription `ACTIVE`
    with `amountDuePaise` 0, day cell `cashCollectedPaise` 500/`DELIVERED`,
    `dispatch-summary` `completedStops` 2 / 37, `cashCollectedPaise` 500.
  - **`references/flows.md` — added Flow G** (route-run packing → bag receipt →
    per-stop completion). The skill had no run-scoped delivery flow; it is now
    documented with the exact version-guarded requests and the
    `RIDER_PHOTO_GPS`-needs-evidence-but-not-OTP rule.
  - **`references/api.md`** — added the `rider/delivery-runs/:runId` and
    `store/subscription-operations/runs/:runId` mutation endpoints and
    `/api/upload/evidence`; added two response traps.
  - **BUG-006 opened (major, `OPEN`)** — `GET
    /orders/delivery-operations/jobs/:id/summary` serializes the assigned
    rider's **full `User` row** (`include: { user: true }`), leaking the bcrypt
    `password` hash and `fcmToken`, and the same response carries
    `bankAccountCiphertext`. Reachable by every role that can read the job;
    `getQueue()` already `select`s a safe shape. Flagged, not fixed (code change
    is out of testing scope).
  - **BUG-007 opened (minor, `OPEN`)** — the same summary reports
    `cod.collected: false` after a `RIDER_PHOTO_GPS` completion has already
    credited the COD ledger (`riderHoldingBalancePaise` 500, `HELD_BY_RIDER`).
    The flag is operation-derived and the photo path never writes a
    `COD_COLLECTED` operation; the rider mobile app gates its "COD collection
    recorded" strip and `customerPaid` on it. Money is correct; the flag/UI
    diverges.
  - Noted a mid-session deploy (`cb1e85fc` → `41daf15c`, a `skills/`-only tree
    change) that briefly 502'd the gateway — live revision must be re-checked
    after any 5xx burst.

- **2026-10-08 · v1.3.0 · aagam-testing (partial-payment delivery session)**
  - Completed one real subscription delivery end to end on live revision
    `41daf15c` with a **partial** cash payment: run
    `cmuz9pz8i1zh3672nr6qpjs6x` (`RUN-AAGA-PM-2026-10-08-f2ce`), stop
    `cmuz9pz971zhe672nv9j46m8f`, Rs 60 collected of Rs 105 due. Stop -> DELIVERED,
    run -> AWAITING_SETTLEMENT, ledger HELD_BY_RIDER 6000, customer shop
    amountCollectedPaise 6000 / amountDuePaise 4500. Screenshots +
    partial_payment_delivery_walkthrough.mp4 under
    AAGAM_E-commerce/agent_demo_shots/.
  - **BUG-008 opened (major, OPEN)** - rider stop modal keeps the stale stop
    after arrive(), hiding the photo/GPS + cash form until the panel is closed
    and re-opened.
  - **BUG-009 opened (minor, OPEN)** - same-day dispatch-to-rider creates the
    run at READY_FOR_PICKUP with the handoff already stamped, so the store's
    Pack button (status === 'PLANNED') never renders and packedBagCount stays
    0 while expectedBagCount > 0.
  - **BUG-010 opened (minor, OPEN)** - an under-collection on a day
    (cashCollectedPaise < cashDuePaise) is not carried into the subscription's
    outstanding balance; the shortfall is dropped on the next funding allocation.
  - **references/flows.md Flow G** - added a "UI nuances" block: store Pack
    gate, rider stale-modal workaround, and partial-cash behaviour.

- **2026-10-08 · v1.3.1 · aagam-testing (delivery completion + fix verification session)**
  - Completed one real subscription delivery end to end on live revision
    `c8dc8a0c` via the job path (covers the request "complete one subscription
    delivery"): job `cmuugfovh4705pspt4spg1n97` (QA E2E Customer, order
    `cmuugfouq46zwpspt9nm3gofg`, COD Rs 105). OTP issued -> COD collected ->
    complete -> job+order DELIVERED, payment CAPTURED, ledger HELD_BY_RIDER,
    subscription `amountDuePaise` cut by 10500, day cell DELIVERED. Ran on a
    clone of `main`; **the delivery was performed against a local checkout's
    live API, no production mutation beyond the QA records already seeded.**
  - **BUG-011 opened (major, OPEN)** - a route with any already-DELIVERED stop
    cannot be packed or handed off as a whole: `confirmPacking()` scans every
    stop and rejects a `DELIVERED` order ("Run order cannot be packed from
    DELIVERED", 409). Reproduced on `cmuyuu8ikzilxdo7hc5el89k5` (AM) and
    `cmuz9pz8i1zh3672nr6qpjs6x` (PM); prevents the remaining stop of a
    partially-completed route from being reached through the run.
  - **BUG-002** moved to FIXED-in-working-tree (rider `RIDER_AT_STORE` copy +
    "Open Pickup Tasks" banner/CTA to `/rider/pickup`).
  - **BUG-008** moved to FIXED-in-working-tree (shared `mergeRunIntoOpenStop`
    helper re-seeds the open rider stop panel after `loadRuns()`).
  - **BUG-005** advanced (MilkDeliveryGrid `todayStats` now accumulates
    packed/sold/left and renders three cards; helper `packages/utils/src/store-run.ts`
    + `apps/api-gateway/src/subscriptions/store-run-actions.spec.ts`).
  - **BUG-004** dependency-security gate now exits `0` locally (npm audit clean,
    uuid override resolves 11.1.1; `GATE_EXIT=0`, `UUID_EXIT=0`).
  - **references/flows.md** - added the run-level packing stall point and the
    `c8dc8a0c` job-path delivery verification.
  - Not deployed: the fixes live in the working tree; `aagaam.in` still serves
    `c8dc8a0c`, so none of these are live yet.

- **2026-10-08 · v1.3.2 · aagam-testing (remaining-bug fixes)**
  - **BUG-010 FIXED (working tree)** — `allocateAfterCodCollectionWithinTransaction`
    keeps an earlier day-cell under-collection shortfall on `amountDuePaise`
    instead of zeroing it, without double-counting a fully COD-settled plan.
    Regression: `subscription-cash-funding.service.spec.ts`.
  - **BUG-011 FIXED (working tree)** — run-level packing / store handoff / rider
    receipt / run start now skip terminal stops via the shared `TERMINAL_RUN_STOP_STATUSES`
    set, so a partially-delivered route still packs and hands off its survivors.
    Regression: `delivery-run-planning-partial.e2e.spec.ts`.
  - `references/flows.md` — the BUG-011 stall point is annotated as fixed.

- **2026-10-08 · v1.4.0 · aagam-testing (full E2E delivery + live re-verification)**
  - Completed a **full subscription delivery end to end** on live `78a8a3f`:
    both AM (`cmuyuu8ikzilxdo7hc5el89k5`) and PM
    (`cmuz9pz8i1zh3672nr6qpjs6x`) runs now `AWAITING_SETTLEMENT`, 6/6 stops
    `DELIVERED`, ₹600 total cash collected (AM stop 3 completed through the
    fixed chain: store packing 201 → handoff → rider pickup → arrive → photo
    proof + COD collect → DELIVERED; job/order both `DELIVERED`).
  - **BUG-005 → FIXED-DEPLOYED** — store *Today's Route Checklist* now shows
    `PACKED 17.25 L · SOLD 0.5 L · LEFT 16.75 L`; `packed = sold + left`.
  - **BUG-007 → FIXED-DEPLOYED** — `cod.collected` true on all three
    rider-photo COD stops (ledger 6000 / 10500 / 10500).
  - **BUG-008 → FIXED-DEPLOYED** — rider stop panel now shows photo/GPS +
    cash controls immediately after `arrive()` (no close/re-open).
  - **BUG-011 → FIXED-DEPLOYED** — a route-partial run packs (201) and hands
    off its surviving stops; proved live by taking AM run stop 3 through the
    whole chain.
  - **BUG-009 → FIXED-DEPLOYED** — run buttons now use shared
    `resolveRunActions`; a dispatch-created `READY_FOR_PICKUP` run renders
    **Pack** (server still stamps an implicit handoff — noted as follow-up).
  - **BUG-010 → still OPEN** — partial-COD carry-forward fix is in the working
    tree but not exercised live in this pass (a fresh funding allocation after a
    ₹60-of-₹105 day was not observed), so left unverified/OPEN.
  - **BUG-002 → FIXED-DEPLOYED** — `RIDER_AT_STORE` help copy + **Open Pickup
    Tasks** banner confirmed present in the deployed rider page bundle.
  - **BUG-006 → PARTIALLY-FIXED (still live)** — `a6044c1` scoped
    `job.currentRider.user` so the bcrypt password hash is gone, but
    `bankAccountCiphertext` / `bankIfscCiphertext` / `bankStatus` /
    `approvalStatus` (+ audit ids) are **still returned to the customer and
    store roles** on `.../summary`, and `/orders/delivery-operations/queue`
    also still leaks the two bank ciphertexts. Entry left open for the
    remaining `select`-scoping.
  - **BUG-012 opened (major, OPEN)** — `GET /orders/delivery-operations/queue`
    still returns every rider's `bankAccountCiphertext` / `bankIfscCiphertext`
    to any store owner (its `user` sub-select is fixed, the bank columns are
    not). Same class as BUG-006 but a different endpoint, so its own entry.
  - **BUG-004** (dependency gate) left `OPEN` — not in this pass's scope.

- **2026-10-08 · v1.4.1 · aagam-testing (rider delivery pass)**
  - Completed one subscription delivery end to end on live `aagaam.in`
    (revision `f4af4a9`): rider `RUN-AAGA-AM-2026-10-08-f2ce` -> confirm bag
    receipt (`POST /rider/delivery-runs/:id/pickup`) -> start (`/start`) -> for
    the remaining funded stop: arrive (`/stops/:id/arrive`) -> upload photo
    (`/upload/evidence`) -> **Verify and complete this stop**
    (`/stops/:id/complete`). Read-back: `DeliveryRunStop`, `DeliveryJob` and
    `Order` all `DELIVERED`.
  - **BUG-015 opened (major, OPEN)** - the rider stop modal's **Mark Delivered**
    in-flight quick action (`POST /store/subscriptions/deliveries/:id/quick-action`
    `TOGGLE_DELIVERED`, same endpoint as the store milk grid) completes the stop
    and the delivery row but never advances the DeliveryJob/Order, so the order
    stays `OUT_FOR_DELIVERY`. `syncRunStopForQuickAction` does not call
    `transitionWithinTransaction`. Regression of the "order stuck
    `OUT_FOR_DELIVERY`" hot-spot on a writer the earlier rider-photo fix missed.
  - Noted (not recorded): `/riders/portal/runs`, `/rider/delivery-runs` and
    `/riders/portal/current` return 404, but the app never calls those paths, so
    a 404 there is not a defect. The rider list/detail flows use
    `/rider/delivery-runs/today` and `/rider/delivery-runs/:id`.

- **2026-10-08 · v1.4.2 · aagam-testing (bug-fix pass)**
  - **BUG-015 fixed** — `StoreMilkGridService.executeQuickAction()` `TOGGLE_DELIVERED`
    now routes the stop's `deliveryJobId` through
    `DeliveryWorkflowService.transitionWithinTransaction` (new
    `advanceOrderForQuickAction`), so a rider/store "Mark Delivered" advances the
    Order to `DELIVERED` like the rider-photo path; the undo branch re-opens it
    (`revertOrderStatusForQuickAction`). Regression:
    `store-quick-action-order-status.e2e.spec.ts` + unit coverage in
    `store-milk-grid.service.spec.ts`.
  - **BUG-006 completed + BUG-012 fixed** — `private job()` and `getQueue()`
    both `select`-scope `currentRider`, so neither the bcrypt password hash nor
    the `bankAccountCiphertext` / `bankIfscCiphertext` reach a customer, store
    owner or admin. Assertion added to `phase3-delivery-operations.spec.ts`.
  - **BUG-013 + BUG-014 fixed** — the `DeliveryRun` unique key now includes
    `riderId` (`20261008000000_delivery_run_rider_scoped_unique`), so a second
    rider's run for the same store/date/slot no longer collides (the 500 on
    dispatch and on Reassign). Regression: `dispatch-second-rider.e2e.spec.ts`.
  - **BUG-010 status corrected** — already `FIXED-DEPLOYED` in `78a8a3f`
    (origin/main); the register still said "working tree, not yet deployed".
  - Still `OPEN`, out of this pass: **BUG-004** (dependency audit gate).

- **2026-10-08 · v1.4.3 · aagam-testing (portal walkthrough + register sync)**
  - Recorded **BUG-016** (OPEN): the mobile rider navigation hand-off is
    single-destination (no `waypoints=`, straight-line 24 km/h ETA); the web
    rider runs page already chains stops. Maps are integrated; only multi-stop
    sequencing is missing.
  - Promoted BUG-006, BUG-012, BUG-013, BUG-014, BUG-015 from
    "FIXED (this branch, not yet deployed)" to `FIXED-DEPLOYED` — the fixes
    landed on `main` as commit `2f4d1be`.
  - Captured four fresh per-portal screen recordings (customer / store / rider /
    admin) from the live site for review; no titles or subtitles are burned into
    the frames.

- **2026-10-08 · v1.4.4 · aagam-testing (rider Run Console prototype)**
  - Designed and built a single-screen rider "Run Console" prototype (one map +
    ordered sequence rail + state-driven primary action) as the proposed shape
    for the bulk-delivery rider UX. Mock data only, provider-agnostic basemap
    (OpenStreetMap default; Google/Mapbox tiles selectable with a key). It is a
    design artifact, not a tested app surface, so it is NOT in the repo (served
    from the work host) and carries no findings.
  - Its "navigate remaining stops" button is the intended fix for **BUG-016**:
    it hands the run's remaining stops to Google Maps as `waypoints=`, matching
    the web rider runs page.

- **2026-10-08 · v1.4.5 · aagam-testing (Run Console v2 — map-first)**
  - Rebuilt the rider Run Console prototype as a map-first, Rapido-style surface:
    the map fills the viewport with floating top chips + tool buttons, and a
    draggable bottom sheet (mobile) / fixed right panel (web, >=1024px) holds the
    hero action and the full delivery-sequence list — no per-stop tab-hopping.
  - Responsive verified in-browser: 360x640, 390x844, 414x896 and 1366x834; all
    stop pins stay clear of the sheet/panel, and the floating tools never
    overlap the panel. Prototype only (mock data), served from the work host.

- **2026-10-08 · v1.4.6 · aagam-testing (Run Console v3 — designed)**
  - v3 keeps the horizontal sequence rail (the v2 side panel was rejected) and
    adds on-map control: filter chips (All / Undelivered / Delivered / Failed /
    COD due, each with a live count that dims the non-matching pins) plus a
    right-edge tool stack (labels, route line, my location, fit) and a `...`
    actions sheet (navigate / call / undo delivery / center / report problem).
  - Visual system: dawn-route palette (bone paper, pine brand, coral active),
    Bricolage Grotesque + Instrument Sans, gradient accent hairline. Verified at
    360x640, 390x844, 414x896 and 1440x834; zero console errors; full flow
    (arrive -> COD/OTP complete -> next) plus filter/undo/milk exercised.

- **2026-10-08 · v1.4.7 · aagam-testing (Store "Today's Route" sheet prototype)**
  - Second design prototype, same dawn-route system as the rider Run Console:
    `store-today.html`. A single "Today's Route" sheet that replaces the
    month-wide grid for the day-of view. Desktop = a real table (sequence,
    customer, plan, slot, base, extra, total, status, COD, quick actions);
    mobile = stacked cards. Five KPIs: Packed / Sold / Left / Stops done / Cash.
  - Modelled on the real grid: statuses SCHEDULED|PACKED|DELIVERED|SKIPPED|FAILED,
    slots AM/PM, quick actions TOGGLE_DELIVERED / SKIP / TOGGLE_SLOT /
    RECORD_PAYMENT today; EXTRA_MILK (extra litres on today's cell) via the
    row + presets (0.5/1/1.5/2L); and a rider-facing add-on dialog for
    "customer wants extra for tomorrow" that mirrors ATTACH_EVENING_MILK
    (qty preset, 1/2/3/5/7-day duration, AM/PM target, price/day) and shows the
    real `[ADD-ON: <qty>|<paise>|<slot>]` encoding it would write.
  - Prototype only (mock data), served from the work host.

- **2026-10-08 · v1.4.8 · aagam-testing (add-on moved to the rider, store page untouched)**
  - Correction: v1.4.7's `store-today.html` is **reverted/removed**. The store
    page was not to be redesigned. The rider is the one at the customer's door,
    updating while on the map, so the extra-milk + "customer wants extra for
    tomorrow" dialog belongs in the **rider Run Console**, not the store sheet.
  - Added to `run-console.html`: a `＋` affordance on every rail card and in the
    top CTA bar (and the `...` actions menu) opening a rider add-on dialog with
    two modes — **Today only** (`EXTRA_MILK`, writes extra litres to today's
    stop, mirrors the app's `EXTRA_PRESETS` 0.5/1/1.5/2L at 40/80/120/160) and
    **Coming days** (`ATTACH_EVENING_MILK` / `addExtraMilk`, mirrors
    `SCHEDULE_DAYS` 1/2/3/5/7 days + AM/PM target). The dialog shows the real
    payload it would send: `[EXTRA: <qty>|<paise>]` or
    `[ADD-ON: <qty>|<paise>|<slot>]`, and the rail card gains a `📅 +xL ×Nd`
    future badge after attaching.

- **2026-10-08 · v1.4.9 · aagam-testing (Run Console implemented in the repo)**
  - The throwaway `run-console.html` prototype is now a **real, committed
    surface**: `apps/admin-dashboard/src/app/(rider)/rider/console/page.tsx`
    (route `/rider/console`, sidebar label **Route Map**) rendering
    `components/rider/RiderRunConsole.tsx` +
    `components/rider/RiderRunConsoleMap.tsx`.
  - Run and stop data come from `GET /rider/delivery-runs/today` and
    `GET /rider/delivery-runs/:runId`; `GET /rider/delivery-runs/route-board` is
    read only for the live rider position. It shares the same
    arrive / proof / OTP / drop-token / COD / fail / add-on endpoints as
    `/rider/runs`, so the prototype's mock data is gone. `flows.md` now documents
    it as an alternate surface over the same state machine, and the rider role
    entry lists **Route Map**.
  - Static checks only: `tsc --noEmit` clean, `eslint` clean on the three
    new/changed files, `next build` succeeds with `/rider/console` in the route
    manifest. The console was **not** exercised at runtime against a live backend
    or an authenticated session.

- **2026-10-08 · v1.5.0 · openhands (AAGAM rider flow session)**
  - Added **Flow H** to `references/flows.md`: a DB-backed, deterministic
    end-to-end run (`apps/api-gateway/src/subscriptions/subscription-flow.e2e.spec.ts`)
    that walks 4 offline + 4 online customers through store rider-dispatch →
    packing → rider bag receipt → photo+GPS per-stop completion with no OTP, and
    enforces the step-4 "must hold" assertions (status coherence, money
    reconciliation, proof mode, idempotency, audit scoping). This documents a
    flow that previously existed only as separate UI/API descriptions across
    Flows A, C and G, closing the self-update gap the skill flags.
  - Verified the suite against a local Postgres 17 instance: 7/7 pass; the wider
    `src/subscriptions/**` regression set is 30 suites / 169 tests green.
  - No bug-register entry: the run surfaced no new defect.
  - `SKILL.md` version bumped 1.4.9 → 1.5.0 (new section); `last-verified` left at
    2026-10-08.


- **2026-10-10 · v1.5.1 · openhands (store react-native-web preview session)**
  - Fixed and documented **BUG-019**: the store app Add-offline-customer form
    (`StoreOfflineCustomerScreen`) had no map/location control and saved every
    offline customer at the hardcoded `17.6913, 83.0039`. It now renders
    `LeafletMap` (`onPinChange`) + a "Use current" GPS button + `/geo/reverse`
    fill, seeds the pin from the selected store real coordinates, and blocks
    submit until a valid pin is set. Verified via the react-native-web store
    preview: a new customer persisted `17.6868, 83.2185` with a reverse-geocoded
    city/pincode (pre-fix rows read `17.6913, 83.0039`). Marked
    `FIXED-NOT-DEPLOYED` (branch `feat/rider-mobile-satellite-map`, not on `main`).
  - `references/flows.md` gained an "Offline-customer location" note under Flow H
    tying the stored `CustomerAddress` coordinates to the rider route/dispatch map.
  - No credentials recorded; the store login was read from the environment.
  - `SKILL.md` version bumped 1.5.0 -> 1.5.1; `last-verified` left at 2026-10-08.

## 2026-10-10 - store grid skip + rider assignment 500s (BUG-020/021/022)

- Verified live against the react-native-web store preview + api-gateway on the
  Supabase AAGAAM_DATABASE. Three store-grid flows were returning opaque HTTP
  500s that read as "Mark Skipped does nothing" and "unable to assign the orders
  to the rider".
- Root cause for two of them is the same: Prisma's default 5s interactive
  transaction budget is too small against the remote pooler once an action fans
  out into several sequential round-trips.
  - BUG-020 executeQuickAction SKIP on a generated/assigned day (order + job +
    run stop + rider reconcile). Fixed by {maxWait:10000, timeout:20000}.
  - BUG-021 dispatchToRider (~8 round-trips per stop). Fixed by
    {maxWait:10000, timeout:30000}. Same bug also had a second, independent
    failure: routeCode is @unique and deterministic, so re-dispatching after a
    skip that cancelled the emptied run collided (Unique constraint failed on the
    fields: (routeCode)). The dispatch now reuses a same-routeCode CANCELLED run
    (reopening it PLANNED) and only suffixes the code if a stale live run squats it.
  - BUG-022 TOGGLE_DELIVERED on a just-dispatched RIDER_AT_STORE job completed
    the delivery/stop but left the Order at RIDER_ASSIGNED (another grid-vs-rider
    split). advanceOrderForQuickAction now walks the job
    RIDER_AT_STORE -> PICKUP_VERIFIED -> OUT_FOR_DELIVERY -> DELIVERED through
    DeliveryWorkflowService.transitionWithinTransaction.
- Evidence: post-fix the SKIP call returns status:"SKIPPED" with the order, job,
  run stop and emptied run all CANCELLED; dispatch returns
  {"success":true, routeCode:"RUN-AAGA-AM-2026-10-10-f5dc"}, the rider board
  shows the stop assigned; and a dispatched-then-delivered day reads
  deliv=DELIVERED job=DELIVERED ordr=DELIVERED stop=DELIVERED.
- Register gained BUG-020, BUG-021, BUG-022 (FIXED-NOT-DEPLOYED).
- SKILL.md version bumped 1.5.1 -> 1.5.2; last-verified 2026-10-08 -> 2026-10-10.

- **2026-10-10 · v1.5.3 · openhands (systematic endpoint + lifecycle sweep)**
  - Ran a role-aware sweep of every GET route that takes no path params, as all
    four roles (customer/store/rider/admin) against the live Supabase-backed
    gateway: 0 server errors across the board.
  - Exercised the write surface end to end. Three new defects found and fixed:
    - BUG-023 (blocker): the shared Prisma wrapper let every interactive
      `$transaction` inherit Prisma's 5s default, so any action doing ~8+
      sequential queries blew the budget and returned an opaque `Transaction
      already closed`/`Transaction not found` 500. Repro: run packing, customer
      skip, customer cancel. Fix: `packages/database/src/index.ts` now defaults
      interactive transactions to `{maxWait:15000, timeout:30000}`. Umbrella
      cause of the earlier one-off per-service timeout patches.
    - BUG-024 (major): rider stop `reorder` parked the moving stop at
      `sequenceNumber:0`, violating `DeliveryRunStop_sequence_check (> 0)`.
      Fix: park at `max+1`.
    - BUG-025 (major): rider `return/start` wrote a synthetic
      `failureOperationId` that FKs to `DeliveryOperation(id)`. Fix: create a
      real operation first and reference its id.
  - Post-fix verification (live): packing 201, skip 201, cancel 201,
    reorder 201 (stop moves to seq 1), return/start 201 (job ->
    RETURNING_TO_STORE). Rider full run flow re-verified: pickup 201, start 201,
    arrive 201, extra-milk 201, toggle-slot 201, record-payment 201, fail 201,
    finish 201; cash-accountability returns rider-holding totals.
  - Register gained BUG-023, BUG-024, BUG-025 (FIXED-NOT-DEPLOYED).
  - SKILL.md version bumped 1.5.2 -> 1.5.3; last-verified stays 2026-10-10.

## 2026-10-10 — react-native-web preview E2E (openhands)

- Ran the tracked `mobile-web-preview/` harness (customer + partner apps) against
  the live backend and drove a full store→rider delivery run
  (`RUN-AAGA-AM-2026-10-10-f5dc`, 8 stops): generated orders, packed, store
  handoff, rider pickup/start, then delivered the 2 online + 2 offline
  customers (seq 5-8) with OTP + `RIDER_PHOTO_GPS` photo proof.
- Fixed two `mocks/navigation.js` harness bugs that made the partner preview
  unusable: (1) every tab screen mounted eagerly, so the hidden `RiderRunDetail`
  crashed the app on `route.params.runId`; (2) the fallback tab bar leaked every
  hidden drill-down as a tab. Both documented in SKILL.md under "Preview
  harness".
- Register gained BUG-026 (store `dispatchToRider` writes null stop
  coordinates — proven by a Prisma read of the run; OPEN) and BUG-027 (rider
  `arrive` accepts an out-of-sequence stop; OPEN).
- SKILL.md version bumped 1.5.3 -> 1.5.4; last-verified stays 2026-10-10.

## 2026-10-10 — BUG-026 fixed + full store→rider E2E re-run (all green)

- Fixed BUG-026: `store-milk-grid.service.ts` `dispatchToRider()` now copies
  the delivery address's `latitude`/`longitude` onto the created
  `DeliveryRunStop` (falling back to the subscription address relation), so the
  dispatched route's pins match each stop instead of being `null`. Gateway
  rebuilt and restarted.
- Re-ran the complete fresh E2E on the fixed bundle: created 2 online
  (self-subscribe) + 2 offline (store-assigned) subscriptions against store
  `c566fec6-ebc2-4c7c-b76d-906ccc357cc3`, generated today's deliveries, dispatched
  all four to one rider, and drove the run through
  packing -> store handoff -> rider pickup -> start -> arrive/OTP/complete x4 ->
  finish.
- Result: run `RUN-AAGA-AM-2026-10-10-f5dc` (`AWAITING_SETTLEMENT`); all four
  target deliveries `DELIVERED` with `deliveryJob` + linked `Order` both
  `DELIVERED`, `status='ACTIVE'`, `amountCollectedPaise=39900`,
  `amountDuePaise=0`; every stop carried its real coordinates matching the
  created destination address (bug-026 regression check PASS).
- BUG-027 (out-of-sequence `arrive`) re-confirmed as still OPEN; it did not
  block the run.

