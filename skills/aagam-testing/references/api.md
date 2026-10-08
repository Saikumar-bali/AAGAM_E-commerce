# API cookbook for testers

Base URL: `https://aagaam.in` (all routes are served under the `/api` global
prefix). Read-only requests are safe to repeat; every `POST`/`PATCH`/`DELETE`
listed here changes shared test data — confirm scope first.

**No credentials are stored in this file, ever.** Read them from the
environment at runtime.

---

## 1. Credentials

| Variable | Role |
|---|---|
| `AAGAM_CUSTOMER_EMAIL` / `AAGAM_CUSTOMER_PASSWORD` | Customer (shop) |
| `AAGAM_STORE_EMAIL` / `AAGAM_STORE_PASSWORD` | Store owner |
| `AAGAM_RIDER_EMAIL` / `AAGAM_RIDER_PASSWORD` | Rider |
| `AAGAM_ADMIN_EMAIL` / `AAGAM_ADMIN_PASSWORD` | Admin |

Rules:

- If a variable is unset, **ask the user** for it. Do not guess, and never
  hard-code it into this skill, a spec, a commit, a screenshot, or a bug entry.
- Prefer the shell session's environment. If you must pass them to a command,
  reference the variable (`$env:AAGAM_RIDER_PASSWORD`) rather than expanding it
  into the command string where it will be logged.

---

## 2. Authentication

`POST /api/auth/login` sets an **HttpOnly `access_token` cookie**. The body
accepts `identifier`, `phoneE164`, or `email` plus `password`.

```powershell
# one cookie jar per role — never reuse a jar across roles
$base = "https://aagaam.in/api"

curl.exe -s -c "$env:TEMP\aagam-rider.jar" -X POST "$base/auth/login" `
  -H "Content-Type: application/json" `
  -d ('{"email":"'+$env:AAGAM_RIDER_EMAIL+'","password":"'+$env:AAGAM_RIDER_PASSWORD+'"}')
```

Subsequent calls reuse the jar:

```powershell
curl.exe -s -b "$env:TEMP\aagam-rider.jar" "$base/riders/portal/pickups"
```

Validate the session before anything else:

```powershell
curl.exe -s -b "$env:TEMP\aagam-rider.jar" "$base/auth/me"
```

### In the browser

Login is email → password → a separate **Continue** button. Two traps:

1. The first `browser.click` after a `fill_form` frequently throws
   `UnknownVizError` — re-snapshot and click again.
2. All roles share one browser profile, so a login for the store invalidates
   the customer cookie. Re-login at each role switch, or do cross-role
   verification through the API jars instead.

---

## 3. Endpoint map (as used by the UI)

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | sets HttpOnly `access_token` |
| GET | `/api/auth/me` | session check |

### Delivery operations (store / admin)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/orders/delivery-operations/queue` | every job with `status`, `currentRider`, `pickupProof`, `inQueue` |
| GET | `/api/orders/delivery-operations/jobs/:id/summary` | single job |
| POST | `/api/orders/delivery-operations/jobs/:id/pickup/confirm` | `{parcelCount}` → `PICKUP_VERIFIED` |
| POST | `/api/orders/delivery-operations/jobs/:id/pickup/challenge` | `{method, parcelCount}` |
| POST | `/api/orders/delivery-operations/jobs/:id/otp/issue` | only at `RIDER_AT_CUSTOMER` |
| POST | `/api/orders/delivery-operations/jobs/:id/return/start` | rider-initiated returns allowed |

### Rider portal (`rider-portal.controller.ts`, prefix `riders/portal`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/riders/portal/home` | cards, offers, active delivery |
| GET | `/api/riders/portal/offers` | job offers |
| GET | `/api/riders/portal/delivery` | current single job |
| GET | `/api/riders/portal/deliveries` | all assigned |
| GET | `/api/riders/portal/pickup` | **returns `pickups()[0]` only** — legacy, do not drive tests from it |
| GET | `/api/riders/portal/pickups` | every pickup task — this is what `/rider/pickup` renders |
| POST | `/api/riders/portal/pickup/:id/verify` | `{lines:[{orderItemId, checkedQuantity}]}` |
| POST | `/api/riders/portal/pickup/:id/problem` | `PROBLEM_REPORTED`, blocks handoff |
| GET | `/api/riders/portal/cod` | COD ledger (independent of earnings) |
| GET | `/api/riders/portal/earnings` | earnings ledger |
| GET | `/api/riders/portal/history` | past deliveries |

### Store subscriptions / milk grid (`subscriptions.controller.ts`, prefix `store/subscriptions`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/store/subscriptions/grid?year&month` | monthly matrix cells |
| GET | `/api/store/subscriptions/dispatch-summary?date=YYYY-MM-DD` | packed/sold/left totals |
| GET | `/api/store/subscriptions/rider-assignments?date=` | `{date, slots, totals, riders[], unassigned[]}` |
| GET | `/api/store/subscriptions/available-riders` | rider picker for dispatch |
| GET | `/api/store/subscriptions/subscribers?status=` | `{subscribers, counts}` |
| GET | `/api/store/subscriptions/customer/:id/statement` | cash ledger vs day cells |
| GET | `/api/store/subscription-operations/runs?serviceDate=` | runs + `stops[]`, works when `rider-assignments` 404s |

### Rider delivery runs (`rider/delivery-runs`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/rider/delivery-runs/route-board?date=` | rider-scoped runs, `expectedBagCount`, `completedStopCount` |
| GET | `/api/rider/delivery-runs/today` | today's runs |

### Admin
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/orders` | queues ALL / AT RISK SLA / UNASSIGNED |
| GET | `/api/riders` | workload `{activeDeliveries, activeRuns, canBeFreed}` |
| PATCH | `/api/riders/:id/status` | release BUSY → ONLINE when workload allows |

---

## 4. Response-shape traps

- **Empty is not broken.** `/api/auth/me` answers `401 {error: "Not authenticated"}`
  when the jar is stale. Re-login rather than assuming a regression.
- **Paginated lists answer `{items, total}` or a bare array** depending on the
  route. Always branch on `Array.isArray(response.data)` the way the UI does.
- **`/api/orders/delivery-operations/queue` includes jobs that are no longer
  actionable** (e.g. already `PICKUP_VERIFIED` with COD still pending, so
  `inQueue: true`). The store page *filters* those out — a card disappearing
  from the UI is not proof the job vanished.
- **404 on a store endpoint can mean "not deployed", not "not found".**
  `rider-assignments` has historically 404'd on live while `available-riders`
  returned 200. Check the served revision before filing anything.
- **HTTP 500 with an opaque body is often a CHECK constraint.**
  `CodLedger.expectedAmountPaise > 0` and
  `CustomerSubscription.amountDuePaise >= 0` both roll back the transaction; a
  500 on a money path means "guard the amount", not "server bug".

---

## 5. Deploy / revision

`.github/workflows/deploy.yml` runs **only from `main`** (or a manual
`workflow_dispatch` with a `ref`). Pushing a feature branch does not deploy, so
`https://aagaam.in` keeps serving whatever `main` last built.

```powershell
# from the repository root: skills/aagam-testing/
.\skills\aagam-testing\scripts\live-revision.ps1   # live vs origin/main
git rev-parse origin/main                           # what should be live
```

`GET /api/health` → `{status, service, revision, timestamp, uptimeSeconds}`;
`revision` is `process.env.DEPLOY_SHA`, or the literal `development` when the
process was started outside a deploy (exit code `1` from the script).

A deploy takes roughly 35 minutes. Never report a fix as "live" on the strength
of a green CI run — wait for the revision to flip.
