---
name: aagam-testing
description: Test the AAGAM commerce platform end to end across its four role surfaces — customer shop, store portal, rider portal and admin dashboard — covering subscription request, store rider-assignment, parcel handoff, delivery with OTP/COD, and the store milk grid's packed/sold/left litre totals. Use when asked to verify an AAGAM flow, reproduce a bug reported on aagaam.in, regression-test a role, or record a newly found defect in the repository bug register.
metadata:
  version: "1.8.7"
  last-verified: "2026-10-11"
  repository: "Saikumar-bali/AAGAM_E-commerce"
  owner: "AAGAM Retail Pvt. Ltd."
---

# AAGAM end-to-end testing

A self-updating test skill for the AAGAM monorepo. It carries the role flows, the
assertions that must hold, the API/curl cookbook, and a repository bug register.
Any agent that loads it is expected to **run tests and then write what it learned
back into the skill** so the next agent starts from current truth.

## Preview harness (`mobile-web-preview/`)

`apps/mobile-customer` and `apps/mobile-partners` are bare React Native apps with
no web target. This repo carries a react-native-web harness at
`mobile-web-preview/` (tracked; not the gitignored `agent_demo_shots/` scaffold)
that renders both apps against the real `@aagam/mobile-shared` API client and the
live api-gateway through a same-origin `/api` proxy (`server.js`). Build/serve
with `./run.sh` (`APP=… `, `PORT`, `API_ORIGIN`, `STRIP_API_PREFIX`,
`MAPBOX_TOKEN`); bundles land in `dist/<app>/bundle.js` and are served under
`/preview/<app>/`. The browser equivalents of the native session live in
`localStorage` (`aagam.keychain.com.aagam.mobile.auth`, written by
`mocks/keychain.js`), so a rider/customer session can be seeded for the browser
by writing that key with the keychain JSON shape and reloading.

### Running the harness against a real backend (Supabase / local gateway)

The harness can serve **any** gateway, not just the sandbox demo DB. To run
against the Supabase database that `AAGAAM_DATABASE` points at:

1. `sudo apt-get install -y redis-server && redis-server --daemonize yes --port 6379`
   — the gateway refuses to boot without Redis (BullMQ subscription worker).
2. Build the shared packages, then start the gateway with the Supabase URL:
   ```bash
   cd apps/api-gateway && set -a && source .env && set +a
   export DATABASE_URL="$AAGAAM_DATABASE" PORT=3005
   node dist/src/main.js &        # dist is the prebuilt bundle; `nest start` is unavailable
   ```
   `main.ts` imports `dotenv/config`, so `apps/api-gateway/.env` supplies
   `JWT_SECRET`/`REDIS_URL`; only `DATABASE_URL` needs overriding.
3. Mint a rider JWT **with the gateway's own `JWT_SECRET`** (the `access_token`
   cookie is not in the login body). Signing it directly avoids needing the
   rider's password:
   ```bash
   DATABASE_URL="$AAGAAM_DATABASE" node -e "const fs=require('fs'),jwt=require('jsonwebtoken'),{PrismaClient}=require('@prisma/client');const p=new PrismaClient();const s=(fs.readFileSync('apps/api-gateway/.env','utf8').match(/^JWT_SECRET=(.*)$/m)||[])[1].trim();(async()=>{const u=await p.user.findFirst({where:{role:'RIDER'},select:{id:true,email:true,phone:true,role:true}});process.stdout.write(jwt.sign({sub:u.id,email:u.email,phone:u.phone||null,role:u.role,roles:[u.role]},s,{expiresIn:'7d'}));await p.\$disconnect();})();" > /tmp/rider.jwt
   ```
4. `server.js` seeds that token into the browser session when
   `AAGAM_RIDER_TOKEN` (or `AAGAM_TOKEN`) is set — it injects a small
   `<script>` into the served `index.html` that writes the keychain key with the
   `{version:1,user,token}` shape, so the bundle boots straight into the rider
   UI. Start with:
   ```bash
   cd mobile-web-preview && export AAGAM_RIDER_TOKEN="$(cat /tmp/rider.jwt)" \
     PORT=12001 API_ORIGIN=http://127.0.0.1:3005 STRIP_API_PREFIX=1 node server.js
   ```
   Watch the `PORT` variable — a shell left over from the gateway step carries
   `PORT=3005` and the preview then dies with `EADDRINUSE` on 3005. `unset PORT`
   (or `env -u PORT`) before starting.

`apps/api-gateway/demo-console-run.ts` is a focused seeder for the rider
full-screen console: it creates a `rcdemo_`-prefixed store, five spread-out
subscribers around Anakapalle, dispatches an AM run to the first `RIDER` user,
and leaves every stop `READY`. It cleans up only its own prefixed rows, so it is
safe to re-run against a shared DB (unlike `demo-seed.flow.ts`, which uses fixed
`demo.` names). Run it from `apps/api-gateway` with `DATABASE_URL` set.

### Rider run board — map-first console (`RiderRunConsole`)

The **run detail screen *is* the map console**: `RiderRunDetailScreen` renders
`RiderRunConsole` directly — there is no header **Map** button and no second
inline map. The Mapbox `RiderRouteMap` owns the screen edge-to-edge with
numbered stop markers; a single **draggable sheet** overlays it with two snap
points:

- **peek** (bottom ~half) — the focused stop card, the run lifecycle block
  (handoff notice / `Confirm N bags received` / `Start delivery run`), the
  signal chips, the ops row (Cash/Extra/Slot/Skip/Problem) and
  Navigate/Call/Deliver.
- **expanded** (drag the grip up, or tap a rail chip / map pin) — the full route
  board: the ordered `StopCard`s, `Finish route after all stops`, and the
  `AWAITING_SETTLEMENT` "Return cash to store" card.

Drag the grip (`Drag up for the route board`) to expand; tapping a rail chip or a
map pin focuses that stop **and** expands the sheet, and opening an inline op
(Cash/Extra/Skip) auto-expands so its controls are never clipped in peek.
`RiderRouteMap` accepts `stops` (`RiderMapStop[]` = `{id,label,latitude,
longitude,status,cashDuePaise,cashPaidPaise,extraCount,skipped,slot,multiSub,
...}`), `activeStopId` and `onStopPress`; the map HTML posts the tapped stop id
back through `postMessage`. Verify with a rider token: Runs tab → the run card →
the console is already open; click a `.stop-marker[data-seq="N"]` inside the map
and confirm the sheet reads `NEXT STOP · N OF M` with that stop's address and
snaps to the expanded board.

The console is **self-contained**: it records partial/full cash (preset + custom
amount, CASH/PhonePe, capped at the stop's outstanding), attaches extra milk
(quantity/repeat-days/slot, idempotency-keyed), toggles the AM↔PM slot, skips
with a reason, and captures the delivery proof inline — a camera photo for
`RIDER_PHOTO_GPS`, a six-digit OTP for OTP handover (Trusted Drop defers to the
full sheet because it needs a QR scan). Every mutation re-fetches the run.
Undo is offered **only** for a settled (`cashDuePaise === 0`) closed stop,
because the server refuses to undo COD-funded stops.

The map HTML now skins each marker by state (delivered / part-paid / failed /
skipped / extra-milk) and draws compact signal badges under the pin (e.g.
`₹100`, `skip`, `+1L`), with a bottom-right **STOP KEY** legend shown when the
route has 2+ stops. The map `useMemo` key in `RiderRouteMap.tsx` includes the
cash/extra/status fields, so a recorded payment repaints the badge without a
remount.

`SubscriptionOperationsService.toggleStopSlot(runId, stopId, {targetSlot,
version})` backs the Slot button; the gateway rejects a move into a slot the
subscription already occupies that day with a clear 400 (`SubscriptionDelivery`
is unique on `(subscriptionId, serviceDate, deliverySlot)`) — see BUG in the
register. Verify with a rider token: focus a stop → **Cash** → `+₹100` →
**Record** and confirm the card flips to `₹100 part-paid` and the marker badge
appears; **Extra** on another stop; **Skip** then reopen to confirm the skip
reason renders.


### Two backends from one origin (`/preview` local, `/live` aagaam.in)

`server.js` can serve a **second, live copy** of every app from the same port.
Set `AAGAAM_LIVE_ORIGIN=https://aagaam.in` and `run.sh all` builds each app
twice: `dist/<app>/` under `/preview/<app>/` (bundle calls `/api`, proxied to
`API_ORIGIN`, the local gateway) and `dist-live/<app>/` under `/live/<app>/`
(bundle calls `/live/api`, proxied to `https://aagaam.in/api`). The live app and
the live API are the same origin, so the browser makes no cross-origin call and
the production CORS allow-list is irrelevant. Reach the live copies at
`/live/mobile-partners/`, `/live/mobile-customer/`, `/live/rider-map/`.
`run.sh` builds the live copy with `OUT_DIR=dist-live PUBLIC_BASE=/live
API_URL=/live/api`; `webpack.config.js` honours those. `proxyHttp` picks
`https`/`http` from the origin scheme, and socket.io upgrades for `/live/*` are
proxied to the live origin too.

### Maps use the real deployed Mapbox token

The deployed VPS env (`/opt/aagam/.env` on the AAGAM host) carries a **valid**
public Mapbox token in `EXPO_PUBLIC_MAPBOX_TOKEN` / `NEXT_PUBLIC_MAPBOX_TOKEN`
(verified: `GET https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=…`
→ 200), plus `GOOGLE_MAPS_API_KEY` / `GOOGLE_WEB_CLIENT_ID`. These are public
client keys (they ship in the browser/app), not server secrets. Put them in a
**gitignored** `mobile-web-preview/.env` (loaded automatically by `run.sh` and
`server.js`); never commit them. An earlier note in this skill claimed "no valid
token exists anywhere" — that was wrong, the value is single-quoted in `.env` and
was missed by an unquoted grep.

The token must reach the bundle two ways, or the map silently renders blank:

1. `webpack.config.js` bakes `process.env.EXPO_PUBLIC_MAPBOX_TOKEN` (and the
   `NEXT_PUBLIC_*` / Google equivalents) via `DefinePlugin`. Webpack does **not**
   populate `process.env`, and `getMapboxToken` reads it, so without this even a
   real `MAPBOX_TOKEN=` build falls through to the dummy `pk.test-dummy…` token.
2. `server.js` injects `window.__ENV__` from `MAPBOX_TOKEN` for any client key
   read from the DOM at runtime.

With a valid token the real Mapbox GL page renders (verified: 33–37 tile
requests, all 200, one `<canvas>`). The token-free SVG mock
(`mocks/rider-route-map-html.js`) is now swapped in **only** when no valid token
is supplied (`USE_MAP_MOCK`), so offline/CI builds still render a map.

Two gotchas when changing the mock swap (`NormalModuleReplacementPlugin`):

- The apps import it relatively (`./riderRouteMapHtml`), so the regex must match
  the bare trailing name (`/riderRouteMapHtml(\.\w+)?$/`) — **not** a
  `components/rider/` prefix or a leading-slash requirement (a `.` precedes it).
  The original `components[\\/]rider[\\/]…` pattern never matched, so the mock was
  never applied even when intended.
- A production build strips comments, so a comment string ("token-free SVG") is
  not a usable build marker — check for a code identifier or build in dev mode.

Two mock bugs found and fixed on 2026-10-10 (`mocks/navigation.js`):

1. The navigator rendered **every** registered tab screen on first paint, so
   hidden drill-downs such as `RiderRunDetail` mounted with no route params and
   crashed the whole app with
   `TypeError: Cannot read properties of undefined (reading 'runId')`. Fixed by
   lazy-mounting routes (render on first focus, then keep mounted and hidden).
2. The fallback tab bar's hidden-route filter was inverted, so every hidden
   drill-down (`RiderRunDetail`, `Notifications`, `RiderCod`, …) leaked into the
   tab bar. Fixed by keying off `tabBarItemStyle.display === 'none'`.

---

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
