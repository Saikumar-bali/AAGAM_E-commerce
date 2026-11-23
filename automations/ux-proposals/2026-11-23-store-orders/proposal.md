# UX proposal — Store Orders board (`StoreOrdersScreen`)

**Date:** 2026-11-23
**Branch:** `ux-proposals/2026-11-23-store-orders`
**Artifact:** [`mockup.html`](./mockup.html) — static, self-contained, no build step
**Screen under review:** `apps/mobile-partners/src/screens/store/StoreOrdersScreen.tsx` (495 lines)
**Route:** `StoreOrdersNavigator` → `OrderQueue` (`apps/mobile-partners/src/navigation/StoreOrdersNavigator.tsx:10`)

---

## 1. Why this screen

The store order queue is the screen a shop owner or counter staff keeps open during
the two busiest windows of the AAGAM day (the morning milk run and the evening
top-up). Every order that moves from *placed* to *packed* to *handed over* passes
through it, and every one of those transitions is a tap that starts here.

It is also the least-covered surface in the recent proposal rotation. The last
seven runs covered subscription detail, rider run detail, the milk grid, checkout,
order tracking, the rider COD ledger and rider pickup/handoff — five of the seven
were rider-side. The store operator has had no design pass.

It qualifies on the "real UX problems" bar rather than cosmetics: three of six
status tabs are physically off-screen, the selected-tab indicator is clipped by a
`maxHeight` smaller than the tab it contains, no card tells the operator what the
next step is, and five colour pairs fail 4.5:1.

---

## 2. Diagnosis with evidence

Every claim below is tied to a line in the shipped file. Contrast ratios are sRGB
relative-luminance calculations against the exact hex values in the source; they
were computed, not eyeballed. The vertical measurements (270pt of chrome, a 425pt
card) were read back from the mockup's own rendering in headless Chromium at
360 × 640, using the shipped `StyleSheet` values, so they are reproducible rather
than estimated.

### P1 — Three of six status tabs are off-screen, and the active underline is clipped

`TABS` defines six tabs (`StoreOrdersScreen.tsx:41-48`). They render into a
horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}`
(`:215-218`), each tab `minWidth: 76` with `gap: 20` inside a container with
`paddingHorizontal: 18` (`:444`, `:445`, `:443`).

Required width = 6 × 76 + 5 × 20 + 2 × 18 = **592pt**. A 360pt phone shows
360 − 18 = 342pt, i.e. three full tabs plus a sliver of the fourth. **"Delivered"
and "Issues" — the only place `CANCELLED` and `PAYMENT_FAILED` orders exist — are
entirely off-screen, with no scroll indicator, no fade and no "more" affordance.**

Worse, the rail clips its own selection state: `tabsScroll` sets `maxHeight: 56`
(`:442`) while `tab` is `height: 68` with a 4pt bottom border (`:444`). The
ScrollView cuts 12pt off every tab — including the 4pt `#0F766E` underline that is
the *only* signal of which tab is active.

### P2 — The queue silently repaints every 15 seconds

`refetchInterval: 15_000` on the orders query (`:157`, and `:120` for the inbox).
There is no new-order signal of any kind: no toast, no badge increment animation,
no "2 new" pill, no sound. On the `NEW` tab a new order simply materialises
somewhere in the list while the operator is looking elsewhere.

The `RefreshControl` makes this worse: `refreshing` is bound to
`storesQuery.isFetching || ordersQuery.isFetching` (`:250-256`), so **every
background poll spins the pull-to-refresh indicator**. The screen appears to be
continuously reloading even when nothing changed.

### P3 — No card says what to do next

`OrderCard`'s only interaction is `onPress` → `OrderDetails` (`:387-391`,
`:240-246`). The next step per status is already modelled in
`StoreOrderDetailsScreen.tsx:52-73` (`PENDING → "Accept order"`,
`CONFIRMED → "Ready for pickup"`, `PACKED → "Deliver with store staff"`), but the
board never surfaces it. To accept four new orders the operator must open four
detail screens and come back four times.

### P4 — Money and payment presentation is ambiguous, and one branch is wrong

- `const total = order?.grandTotal ?? order?.totalAmount` (`:377`) is rendered
  with no label (`:419`) and no statement of what it *means* — order value,
  amount already paid, or cash the rider must collect. For a COD order those are
  different numbers.
- Payment is a separate pill at the very bottom of the card (`:423-425`) reading
  `payment`, which comes from `orderPaymentMethod()` (`storeReferenceUi.ts:33-44`).
  That helper returns the literal string **`'Payment unavailable'`** when the
  payload has no method — and `:484` styles *everything that is not `COD`* with
  `prepaidPill`. **An unknown payment method is rendered in the green "prepaid"
  pill.** That is a correctness bug with money attached.
- Item quantity is a unit sum only (`:417-420`), and `items.slice(0, 3)` hides the
  rest behind "+N more" (`:413`) with no way to expand.

### P5 — Four colour pairs fail 4.5:1

| Element | Source | Ratio |
| --- | --- | --- |
| "STORE ORDERS" eyebrow, 9px | `#A7F3D0` on `#0F766E` (`:436`, `:191`) | **4.27:1** |
| Search placeholder | `#9AA1A8` on `#FFFFFF` (`:297`) | **2.61:1** |
| "Ready" status pill, 11px | `#CB6F0C` on `#FFF2E5` (`:64`, `:464`) | **3.28:1** |
| "Delivered" status pill, 11px | `#148A35` on `#E8F8E8` (`:70`, `:464`) | **4.03:1** |
| COD payment pill, 12px | `#B85907` on `#FFF3E8` (`:486`, `:483`) | **4.30:1** |

All five are normal-weight text below 18pt, so the 4.5:1 threshold applies. The
placeholder and the "Ready" stamp are the worst offenders and they sit on the two
controls the operator uses most.

### P6 — Tap targets under 44pt

Pagination buttons are `minHeight: 39` (`:491`) and the store selector chips are
`height: 39` (`:454`). Both are below the 44 × 44pt minimum, and both are used
one-handed while holding a crate.

### P7 — Search is placeholder-only

The `TextInput` (`:292-299`) has no visible label, no `accessibilityLabel` and no
`accessibilityHint`. Its only identity is the placeholder, which disappears the
moment anything is typed and is inconsistently announced by TalkBack/VoiceOver.
There is also no result count, so a typo looks like "no orders".

### P8 — Cards and tabs have no accessibility roles or state

The tab `TouchableOpacity` (`:222-229`) has no `accessibilityRole="tab"` and no
`accessibilityState={{ selected }}`; the card (`:387-391`) has no
`accessibilityRole="button"` and no `accessibilityLabel`. A screen-reader user is
read a sequence of loose text nodes with no indication that anything is tappable
or which tab is current.

### P9 — The error state has no control

`StateCard title="Orders unavailable" text="Pull down to retry the selected store."`
(`:306`). Pull-to-refresh is the *only* recovery path: unavailable to keyboard and
switch-access users, and awkward on the web preview. There is no Retry button, no
timestamp of the last successful load, and no indication of whether stale rows are
being shown. Counts also collapse to `0` on error (`:168-172`), so the tab badges
claim an empty queue while the screen says it could not load one.

### P10 — Timestamps ignore the store's timezone

`createdTime()` calls `toLocaleTimeString('en-IN', { hour, minute })` with no
`timeZone` (`:79-85`). The customer app pins `timeZone: 'Asia/Kolkata'` for the
same field (`apps/mobile-customer/src/screens/customer/OrdersScreen.tsx:26`). On a
device set to another zone, a time-critical queue displays the wrong "placed at"
time — the operator's only ordering signal for "what came in while I was away".

### P11 — No offline handling anywhere in the partner app

`grep -rn NetInfo apps/mobile-partners/src` returns nothing. When the network
drops, the 15s poll fails silently, the list keeps its last data, and nothing on
screen says the board is frozen. For a queue where an unaccepted order is a lost
sale, "looks live but is stale" is the most dangerous possible state.

### P12 — The palette bypasses the shared tokens

`StoreOrdersScreen.tsx` imports nothing from `@aagam/mobile-shared` and hardcodes
roughly thirty hex values, including five different greens (`#0D7E41`, `#0B7182`,
`#148A35`, `#0F766E`, `#087C35`). `theme.ts` defines `COLORS.primary` and
`COLORS.background`; this screen re-invents both. That drift is *why* P5's status
pills do not share one contrast-tested ramp.

### P13 — Pagination flickers on every poll, and chrome eats the fold

`Next` is disabled while `ordersQuery.isFetching` (`:336`), so every 15-second
poll dims and disables both page buttons for a moment.

The vertical budget is the bigger issue. Header 142pt (measured; `paddingTop: 56`
at `:437` plus eyebrow/title/subtitle and `paddingBottom: 20` at `:435`), tab rail
56pt, search 56pt, list `paddingTop: 16` (`:453`) → **the first order card starts at
270pt**. That first card measures **425pt** (schedule banner + three item lines +
"+1 more" + a separate meta row and payment row), the second 306pt. On a 360 × 640
device the operator therefore sees **0.85 of a single order** — not one complete
order fits above the fold, under a decorative gradient.

---

## 3. Aesthetic direction — "Counter Ledger"

The current screen is the generic partner-workspace shell: teal gradient hero,
white rounded cards, drop shadows, one accent colour. It reads as a dashboard,
but the job is not dashboards. The job is a *queue of paper dockets* that must be
worked through fast, in order, with cash counted at the end.

**Counter Ledger** is built on the physical artefacts of a neighbourhood grocery
counter: the order docket, the rubber stamp, the account ledger. It is a deliberate
move from "app dashboard" to "work surface".

What that means concretely:

- **Paper ground, ink type.** `#F7F5EF` warm paper instead of `#F8FAFC` cool slate;
  cards are pure white, flat, separated by a 1pt rule instead of a shadow. Paper on
  a counter is the most legible thing in a bright shop at 7am, and a flat card does
  not smear under a thumb.
- **Status is a physical stamp on the left edge, not a coloured pill in the
  corner.** A 4pt vertical stripe carries the colour; a stamped label carries the
  word. Status is then readable by *position*, by *text* and by *colour* — which is
  what colour-blind operators and one-glance scanning actually need.
- **Two type voices.** Human data (customer, address) in the platform UI sans;
  machine data (order ID, quantity, money, time) in the platform **monospace**
  with tabular figures, so amounts align down the column like a ledger. This is a
  typographic idea, not a font download: it maps to
  `Platform.select({ ios: 'Menlo', android: 'monospace' })` and ships with zero
  assets, which matters because this app bundles no custom fonts
  (`grep -r fontFamily apps/mobile-partners/src` → nothing).
- **Density as a feature.** The gradient hero is removed from this screen and the
  search moves into the header row, taking chrome from 270pt to 209pt. More
  importantly the *row* shrinks: a 425pt card becomes a 214pt docket, because the
  board summarises ("4 items · Milk ×2 · Curd · Paneer") and leaves the line-level
  detail to the existing detail screen. Net: **0.85 of one card visible today,
  1.7 dockets after** (1.9 once the transient new-orders banner clears).
- **Brand continuity.** The brand green `#0F766E` and ink `#0B3B36` are already in
  `theme.ts` and in `GradientSurface`'s `teal` preset (`#0B3B36 → #0F766E →
  #12897F`). The ledger uses exactly those two as its only chromatic anchors; the
  status ramp is new but deliberately desaturated so it never competes with brand
  green. Nothing about the existing identity is discarded — the gradient is simply
  reserved for the *dashboard* screens where the hero earns its space, not for a
  queue that needs every point of height.

Why not a dark theme: the store counter is used in daylight, often on a cheap
Android panel, and the queue benefits from maximum reflectance. Why not a "cards on
cards" layout: this screen has one axis of structure (status → order → action) and
adding nesting would slow the scan.

---

## 4. Before / after mapping

| # | Problem (evidence) | Change | Expected effect |
| --- | --- | --- | --- |
| P1 | 6 tabs in a 592pt hidden horizontal rail; `maxHeight: 56` clips a 68pt tab (`:215-218`, `:442`, `:444`) | Replace the rail with a **3 × 2 status grid**, every cell ≥ 44pt, counts in tabular figures, `aria-pressed` / `accessibilityState.selected` | All six statuses visible and reachable in one tap; no hidden swipe; selection state can no longer be clipped |
| P2 | 15s silent poll (`:157`); `refreshing` bound to `isFetching` (`:250-256`) | A **live dot + summary line** ("Live · 4 to accept · 2 to pack · 1 with rider") that doubles as the live region, plus an `aria-live="polite"` "2 new orders since 07:40 · Show" pill that appears only when new IDs arrive; pull-to-refresh spinner bound to a real user refresh only | Operator sees new work arrive; the screen stops looking permanently busy |
| P3 | Card only opens details (`:387-391`) | One **primary action per docket**, inline, taken from the existing `STATUS_ACTIONS` map (`StoreOrderDetailsScreen.tsx:52-73`): Accept / Mark packed / Hand to rider / View | 4 accepts = 4 taps instead of 8 taps and 4 screen loads; the queue becomes a work surface |
| P4 | Unlabelled total (`:377`, `:419`); `'Payment unavailable'` styled as prepaid (`:484`, `storeReferenceUi.ts:44`); "+N more" hides lines (`:413`) | **Two labelled money rows**: "Order total" and "Collect cash" / "Prepaid — nothing to collect"; an explicit "Payment status unknown" state that replaces *Accept* with *Review payment*; the item list summarised as "4 items · Milk ×2 · Curd · Paneer" | No order can be handed over with the wrong cash expectation; the unknown-payment case can never render as prepaid |
| P5 | 5 pairs under 4.5:1 (see table) | New contrast-tested ramp: every status/stamp pair ≥ 6.0:1, placeholder `#6B6357` at 5.92:1, eyebrow at 12.40:1 on brand ink | Meets WCAG AA for normal text at every size used |
| P6 | 39pt page buttons and store chips (`:491`, `:454`) | Every interactive element ≥ 44pt; pagination replaced by a 44pt "Load more" | Passes the 44pt target guideline with margin |
| P7 | Placeholder-only search (`:292-299`) | Visible `<label>` "Find an order" above the field, `accessibilityLabel`, result count in the live region, 44pt clear button | Field keeps its identity after typing; a typo reads as "No matches for 'anita'" instead of "no orders" |
| P8 | No roles/state on tabs and cards (`:222-229`, `:387-391`) | The six status cells become real toggle buttons with `aria-pressed` / `accessibilityState={{selected}}`; each docket is an `<article>` whose action is a labelled `<button>` ("Accept order for S. Rao, ₹1,284 cash"), and the docket carries one summary `accessibilityLabel` | Screen-reader users can move by status and by action instead of hearing loose text |
| P9 | Error is a card telling the user to pull down (`:306`); counts read 0 (`:168-172`) | Error card with a real **Try again** button (44pt), the failure reason, "Last sync 07:58 · 4 orders cached", and counts shown as `—` rather than `0` | Recovery is reachable by keyboard, switch and screen reader; "0 orders" can no longer be confused with "could not load" |
| P10 | `createdTime` has no `timeZone` (`:79-85`) | All times pinned to `Asia/Kolkata`, rendered `HH:mm` in mono, with a `datetime` attribute | Ordering signal is correct on any device |
| P11 | No offline handling (no `NetInfo` in the app) | Persistent **offline banner** with last-sync time and a queue note; list muted; actions disabled with an explanation | The dangerous "looks live but frozen" state becomes visible |
| P12 | ~30 hardcoded hex, 5 greens (`:436-493`) | Every colour from the token set below; one green family | Palette can be contrast-audited in one place and cannot drift again |
| P13 | First card at 270pt and 425pt tall; 0.85 of one card visible at 360 × 640; pagination flickers (`:336`) | Chrome 270 → 209pt (hero removed, search into the header); card 425 → 214pt docket; pagination replaced by a 48pt "Load more" that is never disabled by a background poll | **0.85 → 1.7 complete orders above the fold**, and the fold no longer moves under the operator every 15s |

---

## 5. What I would need to verify before shipping this

I could not run any of these headlessly, and I am not claiming they are done:

1. **Real device rendering.** RN's flexbox, `lineHeight` and font metrics differ
   from the CSS in the mockup. The 360 × 640 and 412 × 915 fold positions must be
   re-measured on a device, not trusted from this document.
2. **Screen-reader pass (TalkBack + VoiceOver).** Tab semantics, the docket
   summary label, and whether the `aria-live` "2 new orders" announcement is
   actually polite rather than interrupting. Live regions behave differently on
   each platform.
3. **Font-scale 200%.** Android `fontScale` at 2.0 will overflow 48pt buttons and
   the 3-column status grid. The grid may need to become 2 columns at large scale.
4. **Contrast on-device.** My ratios are sRGB maths; subpixel rendering and cheap
   panels shift perceived contrast at 11-12px. I raised the smallest status text
   to 11px semibold on a ≥6:1 pair, but this needs a device check.
5. **`statusCounts` scope.** The redesign shows counts per status. I could not
   confirm whether `statusCounts` (`:168-172`) is store-wide or filtered by the
   active tab/search; if it is filtered, the counts must be labelled "on this page"
   or fetched separately.
6. **Whether inline actions are safe under polling.** Optimistic Accept/Pack while
   a 15s poll is in flight can resurrect stale state. This needs a real concurrency
   test against the API, plus confirmation that `markOrderReady` and the status
   transition endpoints are idempotent.
7. **Cash-to-collect source of truth.** "Collect cash" must read the COD amount due
   (`payment.status === 'PENDING_COD'`, per the COD notes in `AGENTS.md`), not
   `grandTotal`. I could not confirm the exact field on the store order payload, so
   the mockup labels it as a required field to wire.
8. **New-order chime.** Sound needs a native asset and a per-user preference; not
   verifiable headlessly and not included in the mockup.
9. **Reduced motion.** The mockup uses a CSS `prefers-reduced-motion` query. RN
   needs `AccessibilityInfo.isReduceMotionEnabled()` with a listener — untested.
10. **Tablet / web preview.** The two-column docket grid at ≥ 900pt is a design
    hypothesis; it should be checked against the `mobile-web-preview` harness.

Assumptions the mockup makes that are **not** verified in the API payload: a
per-order distance (I deliberately left it out), a delivery-window field (this one
is real — `deliveryWindow()` at `:88-93` reads `deliveryWindowStart/End`), and the
existence of `addressSnapshot.line1`.

---

## 6. Token changes against `packages/mobile-shared/src/constants/theme.ts`

Existing tokens are kept and re-used; nothing is renamed or removed. Additions are
additive, so the screens that already import `COLORS` are unaffected.

```ts
export const COLORS = {
  // … existing keys unchanged …

  // Counter Ledger surface tones. `paper` is the work-surface ground; it is
  // deliberately warmer than `background` so a queue reads as a physical
  // counter rather than a dashboard.
  paper: '#F7F5EF',
  paperRule: '#E3DED2',      // decorative hairline only (1.6:1, not a control edge)
  ruleStrong: '#8C8574',     // control / card boundary, 3.37:1 on paper
  inkMuted: '#5B5346',       // 6.95:1 on paper, 7.58:1 on white
  brandInk: '#0B3B36',       // = gradients.teal stop 0

  // Status ramp. Each pair is text-on-tint and measured ≥ 6.0:1.
  statusNew: '#0A5C2E',        statusNewTint: '#E6F4E9',        // 7.15:1
  statusPreparing: '#0B5563',  statusPreparingTint: '#E4F1F4',  // 7.29:1
  statusReady: '#8A4A00',      statusReadyTint: '#FBEEDD',      // 6.00:1
  statusPickup: '#1E45A0',     statusPickupTint: '#E7EDFB',     // 7.42:1
  statusDelivered: '#0F5C2A',  statusDeliveredTint: '#E7F5E9',  // 7.21:1
  statusIssue: '#8E1B1B',      statusIssueTint: '#FBE7E7',      // 7.61:1
  codInk: '#7A3B00',           codTint: '#FBEEDD',              // 7.49:1
  focusRing: '#0F766E',
};

// 44 is the floor; the ledger uses 48 for anything used mid-shift.
export const TOUCH_TARGET = { min: 44, comfortable: 48 };

// Machine-data voice: IDs, quantities, money, times.
// Requires `import { Platform } from 'react-native'` at the top of theme.ts —
// the file has no imports today. Ships with zero font assets, which matters
// because neither mobile app bundles a custom font.
export const FONTS = {
  // … existing keys unchanged …
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
};

// One type scale, replacing the 9/10/11/12/13/17/19/21/24 ad-hoc sizes.
export const TYPE = {
  micro:  { fontSize: 11, lineHeight: 14, letterSpacing: 0.8, fontWeight: '700' },
  label:  { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  body:   { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  title:  { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  display:{ fontSize: 28, lineHeight: 34, fontWeight: '700' },
};
```

Retired from this screen only (not from the theme): the per-screen hex literals in
`StoreOrdersScreen.tsx:436-493`, including the five-way green drift
(`#0D7E41`, `#0B7182`, `#148A35`, `#0F766E`, `#087C35`).

**Scope note:** `theme.ts` lives in `packages/mobile-shared` and is consumed by the
customer app too. Adding keys is safe; the redesign only *uses* the new keys from
the partner store screen. `apps/admin-dashboard` has its own token file and is out
of scope for this proposal.
