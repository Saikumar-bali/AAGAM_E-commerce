# UX proposal: rider run detail (2026-09-28)

## Which screen, and why this one

`apps/mobile-partners/src/screens/rider/RiderRunDetailScreen.tsx` (826 lines) — the
screen a milk-delivery rider works from during a subscription delivery run.

Rotation check. The only other `ux-proposals/*` branch and open proposal PR is
`ux-proposals/2026-09-26-subscription-detail` (PR #362, customer
`SubscriptionDetailScreen`). This run deliberately moves to a different app
(`mobile-partners`) and a different user: the rider, on a bike, in the sun, one
hand on the phone, mid-route. That constraint — glanceable, thumb-reachable,
tolerant of bad connectivity — is what drives everything below.

This screen is high-traffic and high-stakes: it is the only place a rider can
start a run, confirm a bag handoff, record arrival, complete a stop with proof,
report a failure, and settle cash. It also carries the largest diagnosis surface
in the rider app: 8 distinct UX problems, of which 3 are WCAG text-contrast
failures I measured from the literal hex values in the source, not guessed.

Every `file:line` below was re-read against the working tree before this
proposal was committed. Where a claim could not be tied to a line, it was
removed rather than softened.

## Aesthetic direction: "Morning manifest"

A printed dairy route manifest, not a dashboard. The rider's mental model is a
clipboard sheet handed over at the store gate: a masthead, a cash line, a ruled
list of stops in order, and a stub you tear off at each door. The redesign makes
the phone look like that sheet.

Why it fits this product. AAGAM is a neighbourhood milk operation; the existing
brand is a deep teal-green with soft rounded cards
(`packages/mobile-shared/src/constants/theme.ts`). I keep that green as the
signal colour and keep the roundness for touch affordances, but I move the
*surface* from cool blue-grey (`#F3F7F5` / `#F8FAF9`) to warm paper
(`#FAF6EE`) and introduce a ruled, gutter-aligned layout with a serif masthead.
That is a deliberate contrast with the current screen, which is a stack of
identical floating cards where every element competes for attention and nothing
reads as a *list you work down*. A manifest has an obvious top-to-bottom
reading order and an obvious next action, which is exactly what a rider needs
while moving.

Signature elements:

- **Cash strip pinned in the masthead** — `To collect` and `Cash in hand` are
  always on screen, in tabular figures, because cash is the one number a rider
  is personally accountable for.
- **The route rail** — stops as ruled rows against a vertical time/sequence
  gutter, so order is legible as a list rather than inferred from card
  stacking.
- **The ticket stub** — the current stop is torn out of the rail: raised, ruled
  at the edges, with its two actions docked in a pinned bar.

Type: a serif stack (`Georgia, 'Iowan Old Style', 'Times New Roman', serif`) for
the masthead, route code and money figures; a system sans stack for body and
controls; `font-variant-numeric: tabular-nums` on every figure so columns of
money align. No webfont is loaded — the artifact stays dependency-free and
renders offline.

## Diagnosed problems, with evidence

All line numbers are `apps/mobile-partners/src/screens/rider/RiderRunDetailScreen.tsx`
unless stated otherwise.

### 1. "Cash held" is a different number in each state of the same screen

- `:549` (IN_PROGRESS masthead) computes
  `money(Math.max(0, run.collectedCashPaise - run.depositedCashPaise))`.
- `:565` (AWAITING_SETTLEMENT cash card) reads
  `money(cashQuery.data?.riderHoldingPaise || 0)` — a different source.
- `RiderRunsScreen.tsx:95` computes a third variant,
  `Math.max(0, collectedCashPaise - depositedCashPaise)`, summed across runs.

Worse, the label is wrong while the run is open. `:549` labels
`collected − deposited` as **"cash held"**, but `:557` requires the rider to
confirm the physical bag receipt *before* the run starts, and the cash card that
explains rider holding only appears at `:565` once the run is
`AWAITING_SETTLEMENT`. So during the run the rider sees a "cash held" figure
that is labelled like money in their pocket but is computed from a run-level
aggregate that has never been reconciled against the individual COD ledgers
(`CashAccountability.riderHoldingPaise`, `subscriptionOperationsService.ts:141-148`).
The API itself distinguishes `expectedCashPaise`, `collectedCashPaise`,
`depositedCashPaise` and `riderHoldingPaise`
(`subscriptionOperationsService.ts:57-59` on the run summary, `:144-147` on `CashAccountability`); the screen collapses them into one
ambiguous label. This is the same class of defect as the ledger/day-cell drift
already documented in `AGENTS.md` ("Subscription money is derived, not read
raw"), on the rider side.

### 2. The proof sheet can contradict itself about the OTP

`:576` renders one of two sentences depending on `cashDuePaise`, and the
cash branch reads:

> `Collect the exact cash amount and take delivery photo proof. No OTP needed.`

It picks that sentence with
`(selectedStop as any).proofMode === 'RIDER_PHOTO_GPS' || Boolean(selectedStop.subscriptionDelivery)`.
`subscriptionDelivery` is a **required, non-nullable** field on `DeliveryRunStop`
(`subscriptionOperationsService.ts:116`), so `Boolean(...)` is always `true` and
the `||` short-circuits: every cash-due stop is told **"No OTP needed"**. The
`'Collect the exact amount only after valid OTP.'` branch is dead code.

That directly contradicts `ProofSummary`, which renders in the same sheet and
says `Collect exactly {money} with customer OTP` for the same stop
(`:171`). Two components on one screen, ~400 lines apart, tell the rider two
different things about whether an OTP is required to take the money — and the
one the rider reads first is the wrong one. For an OTP stop the rider is
primed to skip the handover step.

### 3. "Remaining" is defined three different ways on one screen

- `:545` counts `['READY','PLANNED','ARRIVED','RETRY_PENDING']`.
- `:278` defines `currentStop` with the same four statuses.
- `:547` shows `retryPendingStopCount` as a separate **"retry"** stat.

`DeliveryRunStopStatus` (`subscriptionOperationsService.ts:16-26`) has nine
values including `RETURN_REQUIRED` and `RETURNED`. A stop in `RETURN_REQUIRED`
is pending work for the rider but is counted in neither "remaining" nor "retry",
so the masthead under-reports outstanding work. `completedStopCount` comes
straight off the run summary (`subscriptionOperationsService.ts:54`) and is never
reconciled against the per-stop statuses rendered directly beneath it at `:561`.

### 4. Measured contrast failures on body and label text

I computed WCAG 2.1 ratios from the literal hex values in this file and in
`theme.ts`, and swept every `color`/`backgroundColor` pair in the stylesheet:

| Pair | Where | Ratio | Requirement |
|---|---|---|---|
| `#BAF3DD` on `#0F766E` | `progressPercent`, `:784` | **4.42:1** | 4.5:1 — fail |
| `#64748B` on `#F3F7F5` | `loadingText`, `:783` | **4.40:1** | 4.5:1 — fail |
| `#7A8580` on `#FFFFFF` | `metricLabel`, `RiderRunsScreen.tsx:173` | **3.82:1** | 4.5:1 — fail |
| `#94A3B8` on `#FFFFFF` | `placeholderTextColor` used at `:557, 643, 653, 682, 747, 750, 763, 772` | **2.56:1** | 4.5:1 — fail (placeholder text) |
| `#BAF3DD` on `#0F766E` | `heroEyebrow`, `:784` | 4.42:1 | fail (same token as above) |
| `#0F766E` on `#E7F7EF` | `zoneName`, `RiderRunsScreen.tsx:160` | 4.94:1 | pass, but 11px |
| `#64748B` on `#F7FAF8` | `retryText`, `:791` | 4.53:1 | pass, but 11px — 0.03 above the line |

The `#94A3B8` placeholder problem is the significant one: eight text inputs on
this screen use placeholder-only affordance in the pickup card, the extra-milk
form, the OTP field, the delivery note, the failure note and the cash amount
field. Several of those fields have no visible label above them, so the
placeholder *is* the label, and it is rendered at 2.56:1.

### 5. Tap targets below 44pt

| Control | Line | Size | Notes |
|---|---|---|---|
| `iconButton` (reorder up/down) | `:212-213`, style `:788` | **40×40** | below 44, no `hitSlop` |
| `presetChip` (quantity presets) | `:619-626`, style `:810` | ~**30pt** tall (7px padding + 12px text) | far below 44 |
| `dayChip` (schedule days) | `:662-671`, style `:816` | ~**30pt** tall | far below 44 |
| `reasonChip` (failure reasons) | `:762`, style `:791` | 42pt minHeight | below 44 |
| `secondaryButton` (Navigate) | `:209`, style `:788` | 42pt minHeight | below 44 |
| `primaryButtonSmall` (Open stop) | `:216`, style `:788` | 42pt minHeight | below 44 |
| `extraCloseButton` | `:605`, style `:806` | **`padding: 4`** around a 17px icon | ≈**25×25** |
| `contactRow` (Call customer) | `:575`, style `:790` | 43pt minHeight | below 44 |

The quantity and day chips at ~30pt are the worst: they are the primary
interaction in the extra-milk form and they are being tapped by a rider holding
a crate.

### 6. Unlabelled icon-only controls

`:605` is the clearest case — the extra-milk card's dismiss control is
`<TouchableOpacity onPress={...} style={styles.extraCloseButton}><X size={17} …/></TouchableOpacity>`
with no `accessibilityLabel` and no text. It is a 25×25 unlabelled target.
`:212-213` (reorder) *do* carry `accessibilityLabel`, and `:540` (back) does
too, so the omission at `:605` is an inconsistency rather than a house style.
The sheet close buttons at `:572`, `:761` and `:770` are the same pattern —
icon-only, no label.

The `Switch` at `:764` has no `accessibilityLabel` either; its meaning is
carried entirely by the adjacent visual text, and `accessibilityRole` is never
set on the chips, so a screen reader announces the failure reasons as plain
buttons with no indication that they are one option in a single-select group of
nine. The modals at `:568`, `:760` and `:769` also never set
`accessibilityViewIsModal`, so the run underneath stays reachable to the
screen reader while the sheet is open.

### 7. No offline state, despite an offline queue existing

The screen imports and drives `RiderRunOfflineQueue` (`:57`) and replays queued
actions on reconnect (`:253-260`), but the only surface for that is a small
amber card (`:553`) and a transient `Toast`. There is no offline *screen state*:
`:532` renders a full-screen spinner whenever `runQuery.isLoading`, and `:533`
renders "Route unavailable" for any error including a plain network drop. A
rider in a dead zone with a cached run sees either a spinner or a dead end,
even though the app holds the data and has a queue ready. `refreshControl` at
`:538` also tints `#FFFFFF` against the paper background at the top of the
scroll, which is invisible before the hero.

### 8. Primary actions are below the fold, and the masthead carries no action

The `stickyPrimary` button for `PICKED_UP` (`:555`) and the pickup receipt card
(`:557`) are rendered *after* the hero and after the offline notice. The
`finishButton` (`:563`) is rendered after the entire `run.stops.map` at `:561`.
On a 360×740 device with a 7-stop run, the only way to finish the route is to
scroll past all seven stop cards. `styles.stickyPrimary` (`:785`) is named
"sticky" but is a plain margin-16 view inside the `ScrollView` — nothing pins it.
Meanwhile the masthead (`:540-551`) holds no action at all.

The `nextStopCard` (`:558`) is the one well-placed affordance, but its label is
`NEXT STOP · 3` — a bare sequence number, not the customer or the door.

### 9. The stop sheet opens with the wrong thing at the top

`:572-576`: the sheet header, address, and the cash/funded banner come first,
then the extra-milk form (`:580-725`, ~145 lines of quantity chips, rate input,
day chips, note, and summary), and only *then* the primary action — "I have
arrived" at `:727` or "Verify and complete this stop" at `:751`. On a phone the
extra-milk block pushes the completion action out of the first viewport. Extra
milk is the exceptional case; completing the delivery is the common one.

## Before / after

| # | Problem | Change | Expected effect |
|---|---|---|---|
| 1 | Cash figure differs by state (`:549` vs `:565` vs `RiderRunsScreen.tsx:95`) and is mislabelled "cash held" mid-run | One `Cash strip` in the masthead with two explicit figures — `To collect today` and `Cash in hand` — both fed from `CashAccountability` (`expectedCashPaise`, `riderHoldingPaise`), with a footnote `Reconciles per-stop COD ledgers` | The rider always sees one consistent, correctly-labelled pair; removes a trust-destroying "the number changed" moment |
| 2 | `Boolean(selectedStop.subscriptionDelivery)` is always true, so every cash-due stop says "No OTP needed" (`:576`) while `ProofSummary` says "with customer OTP" (`:171`) | The dead `|| Boolean(...)` is dropped; one component owns the money-and-proof sentence, branching on `cashDuePaise` **and** `proofMode`; the OTP requirement becomes its own labelled row | The rider is never told to skip an OTP that the same screen says is required; one of the two contradictory strings is deleted rather than restyled |
| 3 | "Remaining" defined three ways (`:545`, `:547`), excludes `RETURN_REQUIRED` | Masthead progress counts all non-terminal statuses in one place and shows `3 remaining · 1 to retry · 1 to return` as a single reconciled line | Outstanding work matches what the list below shows |
| 4 | `#BAF3DD`/`#0F766E` 4.42:1, `#64748B`/`#F3F7F5` 4.40:1, `#94A3B8` placeholders 2.56:1 | New `text.ink2` `#3A4A42` (9.38:1 on card) and `text.ink3` `#5A6B62` (5.65:1) for all secondary/body/label text; every input gets a visible `<label>` plus a `#5A6B62` placeholder | All body and label text clears 4.5:1; placeholder-only fields disappear |
| 5 | 8 controls under 44pt (`:605` ≈25pt, chips ≈30pt, `:212` 40pt, `:209/:216/:762` 42pt) | Every interactive element is `min-height: 44px` with `min-width: 44px`; chips become 44pt rows in a single-select group | Thumb-accurate while holding a crate |
| 6 | Unlabelled icon-only dismiss (`:605`), unlabelled sheet closes (`:572/:761/:770`), unlabelled `Switch` (`:764`), no group semantics on chips (`:762`), no `accessibilityViewIsModal` (`:568/:760/:769`) | Dismiss gets `aria-label="Close extra milk form"`; switch gets a real label; chips become `role="radio"` in a `radiogroup` with `aria-checked`; sheets are marked modal | Screen-reader users can operate every control, know the state of the group, and are not left traversing the run behind an open sheet |
| 7 | No offline state (`:532-533`) | Explicit `offline` state that renders the cached run plus a banner (`Offline — 2 actions queued, will sync`) and a `Sync now` action; error state distinguishes "no network" from "route failed" | Rider keeps working in a dead zone instead of staring at a spinner |
| 8 | Primary action below the fold (`:555`, `:557`, `:563`); "sticky" button is not sticky (`:785`) | A real pinned action bar outside the scroll area holds the single next action; masthead gains the run state chip; `NEXT STOP` card leads with the customer name and door, not `NEXT STOP · 3` | The next action is reachable without scrolling, on any run length |
| 9 | Stop sheet puts a 145-line extra-milk form above the completion action (`:580-725` vs `:751`) | Sheet reorders: proof/money status → the one primary action → collapsed `<details>` "Add extra milk / schedule" → note → secondary failure action | Completion is one thumb-reach from opening the sheet; extra milk is still fully available, one tap away |

## Token changes against `packages/mobile-shared/src/constants/theme.ts`

Additions only; nothing existing is removed. `COLORS.primary` (`#0F766E`),
`brandGreen` (`#0C7659`) and the `SPACING`/`BORDER_RADIUS` scales are kept and
reused — the manifest surface is a warm-paper variant, not a new brand.

| Token | Value | Replaces / used for | Measured ratio |
|---|---|---|---|
| `colors.surfacePaper` | `#FAF6EE` | was `#F3F7F5` screen bg, `#F8FAF9` items box | — |
| `colors.surfaceRule` | `#9E8F73` | was `#E1EAE6` / `#E2EBE7` card borders | **3.17:1** on card (non-text, ≥3:1) |
| `colors.textInk` | `#12211B` | was `#17211D` headings | 16.68:1 on card |
| `colors.textInk2` | `#3A4A42` | was `#475569` / `#64748B` body and labels | **9.38:1** on card, **8.70:1** on paper |
| `colors.textInk3` | `#5A6B62` | was `#94A3B8` placeholders, `#7A8580` micro-labels | **5.65:1** on card, 5.25:1 on paper |
| `colors.signalInk` | `#0A4F49` | was `#0F766E` when used as *text* | **9.43:1** on card |
| `colors.signalFill` | `#0F766E` | unchanged `primary`; fills only | 5.47:1 with white |
| `colors.signalBg` | `#E3F1EC` | was `#E7F7EF` / `#E2F5EC` tint chips | — |
| `colors.cashInk` / `cashBg` | `#8A4B00` / `#FFF2D9` | unchanged cash pair | 6.14:1 |
| `colors.dangerInk` / `dangerBg` | `#A32119` / `#FDECEC` | was `#B42318` / `#FDECEC` | **6.59:1** (was 5.76:1) |
| `colors.okInk` / `okBg` | `#075E45` / `#DFF3E9` | was `#0F766E` / `#E5F7EE` | **6.73:1** (was 4.92:1) |
| `colors.railTrack` | `#B9A98C` | was `rgba(255,255,255,0.18)` | fill `#0A4F49` vs track = **4.09:1** |
| `colors.focusRing` | `#0A4F49` | new — 2px ring + 2px offset | — |
| `radius.ticket` | `18` | new — stop rows and the torn stub | — |
| `type.masthead` | `Georgia, 'Iowan Old Style', serif` | new display stack | — |
| `type.numeric` | `font-variant-numeric: tabular-nums` | new — all money and counts | — |
| `motion.fast` | `120ms` | new; `@media (prefers-reduced-motion: reduce)` disables transform/opacity transitions | — |

## Checks I ran on the mockup itself (headless)

These are mockup-level, not device-level. They establish that the artifact
renders and that the numbers in the tables are computed, not asserted.

- Rendered `mockup.html` in headless Chromium at desktop width and inside a
  360px-wide iframe: no console errors, no horizontal overflow, all four state
  sections (`s-default`, `s-loading`, `s-empty`, `s-error`) present with
  non-zero height.
- Measured every interactive element in the live DOM: minimum control height
  44px, zero controls without an accessible name, decorative icon SVGs marked
  `aria-hidden` so they do not pollute the accessibility tree.
- Recomputed every contrast ratio in the tables below from the literal hex
  values using the WCAG 2.1 relative-luminance formula. The failing current
  values were confirmed, not estimated: `#94A3B8` on white **2.56:1**,
  `#7A8580` on white **3.82:1**, `#64748B` on `#F3F7F5` **4.40:1**,
  `#BAF3DD` on `#0F766E` **4.42:1**.
- Confirmed `prefers-reduced-motion` and `:focus-visible` blocks are present.

None of this validates the shipped React Native screen. The list below is what
still needs a device.

## What I would need to verify before shipping this

Honest list — these are the things this mockup cannot establish.

1. **Contrast measured on-device.** The ratios above are computed from literal
   hex values in the source and from my proposed tokens. Platform font
   smoothing, subpixel rendering and Android's font scaling change effective
   contrast. Needs a real probe on a physical device at default and at 200%
   font scale. I could not run that headlessly.
2. **Colour-blind check.** The manifest uses green/cash-amber/red for stop
   state. I have added a text status word to every stop row so colour is never
   the only channel, but I have not simulated deuteranopia/protanopia to confirm
   the amber "cash due" and green "funded" rows stay separable.
3. **Tap-target measurement on device.** I claim 44pt minimums from CSS in the
   mockup. The shipped screen uses React Native `minHeight` in density-independent
   pixels, and `iconButton` at `:788` is 40×40 *without* `hitSlop`. Whether the
   fix is a style change or `hitSlop` needs a device check.
4. **Screen-reader traversal order.** I have written `aria-label`, `role="radio"`
   and `aria-checked` in the mockup, but the shipped screen is React Native:
   the equivalent is `accessibilityRole` / `accessibilityState` /
   `accessibilityLabel`, and the correct grouping depends on how VoiceOver and
   TalkBack read the modal. Needs a real VoiceOver + TalkBack pass on the stop
   sheet, the extra-milk form and the failure sheet.
5. **Whether the cash-strip change is a UI-only change.** Problem 1 is partly a
   data question: the mockup assumes `CashAccountability.riderHoldingPaise`
   (`subscriptionOperationsService.ts:147`) is authoritative and always
   available. Today `cashQuery` is `enabled` only for
   `AWAITING_SETTLEMENT`/`COMPLETED` (`:273`). Showing "Cash in hand" during the
   run requires enabling that query earlier, or a server-side field on the run
   summary. **That is a behavioural change and must be decided by the backend
   owner before this design can be implemented as drawn.** If it is not
   available mid-run, the fallback is to show only `To collect today`.
6. **Whether `RETURN_REQUIRED` stops should appear in "remaining".** I asserted
   they should (problem 3) from reading the status enum. The operational rule
   may be that a return leg is deliberately excluded from the rider's stop list.
   Needs confirmation from ops.
7. **Real offline behaviour.** The mockup renders an offline banner; the actual
   queue semantics, the conflict path (`:257`) and the stale-cache TTL are data
   layer concerns the mockup does not implement. Needs an airplane-mode test on
   a device.
8. **Reduced-motion.** The mockup ships a `prefers-reduced-motion` block. React
   Native uses `AccessibilityInfo.isReduceMotionEnabled`, which is a different
   mechanism; the implementation would need to read it.
9. **The "current" column is a reproduction, not a screenshot.** I rebuilt it
   from the literal style values in the source. It is accurate to those values
   but it is not a device capture, and any platform-specific rendering
   difference will not be visible in it.

## Artifacts

- `automations/ux-proposals/2026-09-28-rider-run-detail/proposal.md` (this file)
- `automations/ux-proposals/2026-09-28-rider-run-detail/mockup.html` — one
  self-contained static file, no build step, no dependencies, no webfont
  request. Renders the current screen beside the redesign for the default
  in-progress state, and then a state gallery covering loading, empty,
  error/offline, the pickup handoff, and the stop sheet. Accurate at 360px and
  at desktop width.
