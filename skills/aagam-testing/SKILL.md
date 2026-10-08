---
name: aagam-testing
description: Test the AAGAM commerce platform end to end across its four role surfaces — customer shop, store portal, rider portal and admin dashboard — covering subscription request, store rider-assignment, parcel handoff, delivery with OTP/COD, and the store milk grid's packed/sold/left litre totals. Use when asked to verify an AAGAM flow, reproduce a bug reported on aagaam.in, regression-test a role, or record a newly found defect in the repository bug register.
metadata:
  version: "1.4.5"
  last-verified: "2026-10-08"
  repository: "Saikumar-bali/AAGAM_E-commerce"
  owner: "AAGAM Retail Pvt. Ltd."
---

# AAGAM end-to-end testing

A self-updating test skill for the AAGAM monorepo. It carries the role flows, the
assertions that must hold, the API/curl cookbook, and a repository bug register.
Any agent that loads it is expected to **run tests and then write what it learned
back into the skill** so the next agent starts from current truth.

## Hard rules

1. **Never write credentials into this skill or any file in the repository.**
   Read them at runtime from the environment variables listed in
   `references/api.md`. If a variable is unset, ask the user for it. Do not echo
   secrets into logs, screenshots, commit messages, or the bug register.
2. **Read before you write.** The default posture is read-only. Mutating an order
   (handoff, delivery, COD capture, cancel) changes shared test data — get an
   explicit go-ahead for the specific step first, and say which record you will
   touch before you touch it.
3. **Every finding is evidence-backed.** A bug needs: the exact UI route or API
   call, the observed value, the expected value, and the code path (file + line
   when it can be localised). No "seems broken".
4. **Never claim a fix is live until the served revision contains it.**
   `aagaam.in` only rebuilds from `main`. See step 1.
5. **Do not weaken a test to make it pass.** If a precondition blocks the flow,
   that is a finding, not an obstacle to route around silently. If you do work
   around it to keep testing, record the workaround in the bug register.

## 1. Orient before testing

1. Read `references/bug-register.md`. Open bugs are the first thing to re-test —
   a fix may already be live.
2. Check what the site is actually serving. From this skill's directory:

   ```powershell
   # from the repository root: skills/aagam-testing/scripts/live-revision.ps1
   .\skills\aagam-testing\scripts\live-revision.ps1   # live vs origin/main
   .\skills\aagam-testing\scripts\live-revision.ps1 -NoGit   # print only
   ```

   It reads `GET /api/health` → `{status, service, revision, timestamp,
   uptimeSeconds}`, where `revision` is `DEPLOY_SHA`. If live differs from
   `origin/main` the site is running an older build and **a bug reproducible
   locally may already be fixed upstream**. Record the revision you tested
   against in your report; the script exits `1` when live is stale and lists
   the commits not yet shipped.
3. Read `references/flows.md` and pick the flow that matches what is being
   tested. If the flow you need is absent, that is a gap — add it (step 7) even
   if you cannot test it this session.
4. Note the expected side effects of the test (which orders/subscriptions move
   state) and confirm scope with the user before the first mutation.

## 2. Establish a session

Two ways to drive the environment; prefer the API when the page polls heavily and
element indices shift under you, prefer the browser when the question is about
what a human actually sees.

| Need | Use |
|---|---|
| Assert a value, walk a state machine, reproduce a defect precisely | `curl`/`fetch` with an auth cookie (cookbook: `references/api.md`) |
| Judge layout, copy, ordering, empty states, whether a control is reachable | browser automation against `https://aagaam.in` |

**Session caveat:** all roles share one browser profile, so logging in as the
store invalidates the customer's cookie. Either re-login per step, or hold one
cookie per role with `curl -c` jars (one jar per role, never reuse a jar across
roles).

## 3. Run the flow

The canonical chain, condensed — full per-role detail is in `references/flows.md`:

```text
customer subscribes
  -> nightly generation makes Order + DeliveryJob(WAITING_FOR_DISPATCH) + DeliveryRunStop
  -> store assigns rider                DeliveryJob(RIDER_ASSIGNED)
  -> rider starts trip, arrives         RIDER_EN_ROUTE_TO_STORE -> RIDER_AT_STORE
  -> rider verifies item checklist      riderPickupTask = VERIFIED      [GATE]
  -> store confirms handoff             PickupProof + PICKUP_VERIFIED   [blocked until the gate]
  -> rider travels, arrives             OUT_FOR_DELIVERY -> RIDER_AT_CUSTOMER
  -> OTP + COD collection + confirm     DELIVERED, Order DELIVERED, day cell DELIVERED
```

The gate at step 5 is the single most common stall in this product: the store's
**Confirm handoff** button fails with *"The Rider item and parcel checklist must
be verified before handoff"* while the rider's home card tells the rider to wait
for the store. If the chain stalls there, it is a known finding — check the
register, do not rediscover it from scratch.

## 4. Assertions that must hold

Assert these on **every** run; they are where this codebase has regressed before.

- **Status coherence.** `DeliveryJob`, `Order`, `SubscriptionDelivery` and the
  `DeliveryRunStop` agree. A DELIVERED job with an `OUT_FOR_DELIVERY` order is a
  bug (see the register's notes on workflow-transition bypasses).
- **Money.** The subscription cash ledger (`amountCollectedPaise` /
  `amountDuePaise`) and the per-day `cashCollectedPaise` cells must reconcile
  through `reconcileSubscriptionBalance` — never read the raw columns. A Paid
  figure that disagrees with the day cell in the same row is a bug.
- **Litres.** Packed/sold/left must agree between the dispatch summary and the
  rider prep demand. Assertions live in `references/store-grid.md`.
- **Rider busy-state.** A run with zero live stops must not pin a rider BUSY.
- **Idempotency.** Replaying a handoff, OTP issue, or COD collect must not
  double-count.

## 5. Store grid — packed / sold / left

The store's daily milk totals (`totalBuffaloMilkLiters`, `totalCowMilkLiters`,
`totalMilkLiters`, `completedStops`, `pendingStops`) answer "what did the rider
leave with, what was sold, what came back". Exact endpoints, the quantity
resolver, skip/add-on handling and worked examples are in
`references/store-grid.md` — read it before asserting on litres, because plan
names and add-ons are parsed out of strings and are easy to mis-read.

## 6. Record what you found

Append to `references/bug-register.md` using its template. One entry per distinct
defect, never merged. Statuses: `OPEN`, `FIXED-NOT-DEPLOYED`, `FIXED-DEPLOYED`,
`NOT-A-BUG`, `WON'T-FIX`. When you verify a fix, update the **same** entry's
status and evidence rather than adding a second entry.

## 7. Self-update protocol

This skill must not drift. Perform these at the end of every session in which you
learned something, and before handing off to another agent.

1. **Missing or wrong flow?** Add or correct the section in
   `references/flows.md`. A flow you had to derive from code is by definition
   missing from the skill — write it down.
2. **New defect?** Add it to `references/bug-register.md`. Status change on an
   existing defect? Edit that entry.
3. **New endpoint or changed route?** Update `references/api.md`.
4. **New assertion or quantity rule?** Update `references/store-grid.md`.
5. **Bump the metadata** in this file's frontmatter: increment `version`
   (major = flows restructured, minor = new section, patch = corrections) and set
   `last-verified` to today.
6. **Log it** in `references/CHANGELOG.md` — one line, who/what/why. Never
   rewrite history there; append.
7. If you found *no* gaps, still update `last-verified` so the next agent knows
   how fresh the content is.

Keep every file committed. A skill that is updated but not committed is invisible
to the next model.

## 8. Definition of done

- [ ] Tested revision recorded (from `scripts/live-revision.ps1`)
- [ ] Flow walked to its terminal state, or the blocking finding recorded
- [ ] Money, status, litres and idempotency assertions evaluated
- [ ] Bug register updated — new entries added, stale statuses corrected
- [ ] `flows.md` covers every step you actually performed
- [ ] `version` + `last-verified` bumped, `CHANGELOG.md` appended
- [ ] No secrets in any file; `git status` reviewed before commit

## Reference index

| File | Contents |
|---|---|
| `references/flows.md` | End-to-end UI flows per role: customer, store, rider, admin |
| `references/api.md` | Auth + endpoint cookbook, one cookie jar per role |
| `references/store-grid.md` | Milk grid, litre math, packed/sold/left assertions |
| `references/bug-register.md` | Living defect register with evidence and status |
| `references/CHANGELOG.md` | Append-only history of this skill's own updates |
| `scripts/live-revision.ps1` | Prints the revision `aagaam.in` is serving |
