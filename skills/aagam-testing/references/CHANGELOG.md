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
