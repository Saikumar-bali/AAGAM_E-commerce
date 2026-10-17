# UX proposal: store milk delivery grid (2026-10-05)

## Which screen, and why this one

`apps/admin-dashboard/src/components/MilkDeliveryGrid.tsx` (3448 lines) — the
store owner's milk-subscription operations board. It is the single screen where
the shop reconciles a month of deliveries: who gets milk today, in which slot,
what was delivered, what cash came in, and what is still owed.

Rotation check. Two `ux-proposals/*` branches exist and both have open proposal
PRs:

- `ux-proposals/2026-09-26-subscription-detail` — PR #362, customer
  `SubscriptionDetailScreen` (mobile-customer)
- `ux-proposals/2026-09-28-rider-run-detail` — PR #366,
  `RiderRunDetailScreen` (mobile-partners)

This run deliberately moves to a third surface: the **admin dashboard**, and a
third user — the store owner at a counter, on a laptop or a phone, reconciling a
dense table rather than reading one subscription or working one route. It is the
highest-density, highest-traffic admin screen in the product and it carries the
largest diagnosis surface yet: 10 distinct, line-citable problems, including
measured WCAG contrast failures and a keyboard-accessibility gap on the core
grid interaction.

Every `file:line` below was read against the working tree at
`main` (`142138c`) before this proposal was committed. Where a claim could not
be tied to a line it was removed rather than softened.

## Aesthetic direction: "The Delivery Ledger"

A printed dairy daybook, not a dashboard. A milk store's records have always
been a ledger: a ruled sheet, a customer name in the margin, one column per day,
litres and rupees aligned in tabular figures, a running total ruled at the
bottom, and red ink for what is owed. The redesign makes the screen look like
that ledger — because that is already the mental model the store owner brings to
it.

Why it fits this product. AAGAM is a neighbourhood milk operation. The existing
brand is a deep teal-green (`#0F766E` / `#0C7659`) on cool blue-grey surfaces
(`packages/mobile-shared/src/constants/theme.ts`). I keep that green as the
signal colour and keep the rounded touch affordances, but I move the *surface*
from cool blue-grey (`#F8FAFC`, `#F1F5F9`) to **warm paper** (`#F7F1E6`) and
introduce a **rule-based grid**: 1px hairlines, a ruled gutter, a serif masthead
and serif money figures, and `font-variant-numeric: tabular-nums` on every
column of numbers. That is a deliberate contrast with the current screen, which
is a stack of identical rounded cards and a table where every badge competes for
attention at 7–10px. A ledger has an obvious reading order, aligned money, and
one place to look for "what is owed" — which is exactly what reconciliation
needs.

Signature elements:

- **The masthead** — store name in serif, month, and three reconciled totals
  (litres out, cash in, dues outstanding) that read as the ledger's running
  balance. The masthead states the money definition once: *"Cash in is every
  rupee recorded on a day cell; Dues is reconciled per contract."*
- **The ruled ledger** — customer rows against a day-column grid with hairline
  rules; money and litres right-aligned in tabular figures so columns compare
  vertically.
- **The row margin** — customer identity is the ledger's left margin, on a
  slightly darker paper tone, with the sequence number as a tab.
- **Ink discipline** — the only saturated colours are the brand green (delivered
  / settled) and a deep ledger red (dues). Everything else is paper and ink.
  This is the direct answer to the current "rainbow of 7px badges".

Type: a serif stack (`'Iowan Old Style', 'Palatino Linotype', Georgia, serif`)
for the masthead, day numbers and money figures; a humanist sans stack for body
and controls; tabular figures throughout. No webfont is loaded — the artifact
stays dependency-free and renders offline.

## Diagnosed problems, with evidence

### P1 — The grid is a mouse-only control. No keyboard, no screen reader, no roles.

The core interaction is the day cell: a bare `<td>` with an `onClick`.

- `MilkDeliveryGrid.tsx:1644-1646` — `<td … onClick={() => setSelectedCell({ row, day, cell })}>`.
  A `<td>` is not focusable and has no `tabIndex`, no `role`, no `onKeyDown`.
- Repo-wide in this file: `grep -c 'tabIndex'` → **0**, `grep -c 'onKeyDown'` →
  **0**, `grep -c 'role='` → **0**, `grep -c 'aria-'` → **0**.
- The only keyboard affordance is Escape-to-close on the modal
  (`MilkDeliveryGrid.tsx:493-502`). There is no way to *open* a cell with the
  keyboard, so a keyboard-only or screen-reader user cannot reach the primary
  task at all.

### P2 — 0 `aria-label`s and 0 `role=`s on an icon-dense screen.

`grep -c 'aria-label'` → 0, `grep -c 'role='` → 0. The Refresh control is an
icon-only button whose only accessible name is a `title` attribute
(`MilkDeliveryGrid.tsx:1257-1263`), which is not announced by screen readers as
a label. The month stepper (`:1187-1200`), the "Today" jump (`:1206-1213`) and
the per-row Bill button (`:1743-1747`) are the same pattern.

### P3 — Tap targets far below 44×44pt.

The dashboard has a documented mobile path (`viewMode` switches to cards under
768px, `MilkDeliveryGrid.tsx:508-512`), so touch matters.

- Month stepper: `p-1` around a 14px icon → ~22px (`:1187-1200`).
- Today jump: `px-2 py-1` at `text-xs` → ~24px tall (`:1206-1213`).
- Refresh: `p-1` → ~22px (`:1257-1263`).
- Filter toggles: `px-2 py-1` at `text-[11px]` → ~22px (`:1294-1310`,
  `:1326-1341`).
- Per-row Bill: `h-7 w-7` = 28px (`:1743-1747`).
- Delivery-card Bill: `p-2` → ~32px (`:1131-1137`).
- Card "Undo": `py-2` at `text-xs` → ~32px (`:1114-1121`).

None reach 44px. The Refresh and Bill buttons are also icon-only (P2).

### P4 — Money columns are mislabelled and can drift from the day cells.

- The column headers are `Paid` and `Due` (`MilkDeliveryGrid.tsx:1555-1556`),
  but the values are rendered straight from `totalCollectedPaise` /
  `totalDuePaise` (`:1734-1738`). "Paid" reads as "settled this month" while the
  number is ledger cash collected, which is a different thing.
- The value comes from `reconcileSubscriptionBalance`
  (`apps/api-gateway/src/subscriptions/store-milk-grid.service.ts:342, 411-412`),
  which the repo notes describe as "the ledger as a floor" that absorbs
  day-cell cash. So the *column* is a derived figure, but nothing on screen
  says so. A store owner reading `Paid ₹50` next to a `₹130` day cell cannot
  tell which one is authoritative.
- The single-day payment badge is a bare `₹` figure with the mode implied by
  colour only (`:1692-1699`): purple = PhonePe, green = cash, and the "Due"
  state is a separate unlabelled chip (`:1700-1703`).

### P5 — Critical data is set at 7–10px.

Measured from the source classes:

- `text-[7px]` — assigned-rider badge (`:1709`) and photo-proof badge (`:1719`).
- `text-[8px]` — plan-change chip (`:1663`), extra-milk chip (`:1686`),
  payment badge (`:1694`), "Due" chip (`:1701`), customer type chip (`:1574`).
- `text-[9px]` — skipped chip (`:1675`), plan-count chip (`:1611`).
- `text-[10px]` — phone and address in the customer cell (`:1583-1586`),
  "Next stop on top" hint (`:1447`), "Hide Completed" (`:1479`).

7px is roughly 5pt; 10px is roughly 7.5pt. None of this is legible at arm's
length on a counter laptop, let alone a phone.

### P6 — Measured text-contrast failures (WCAG 2.1 AA, 4.5:1 for normal text).

Computed from the literal Tailwind hex values against their backgrounds:

- `text-slate-400` (`#94A3B8`) on white `#FFFFFF` = **2.56:1** — used for the
  customer address (`:1586`), the search icon (`:1272`), the loading sub-line
  (`:1394`), "Next stop on top" (`:1447`), "Hide Completed" (`:1479`), the
  week-day initials (`:1541`), and the row index (`:1566`).
- `text-slate-400` on the today-header `bg-emerald-600` (`#059669`) = **1.51:1**
  (`:1541`).
- `text-slate-500` (`#64748B`) on white = **4.76:1** — this one passes for
  normal text but not for the 10px body copy it is used on in practice.

`grep -c 'motion-reduce'` → 0, so the `animate-spin` / `transition-all` /
`duration-500` animations (`:1392`, `:1428`) have no reduced-motion fallback.

### P7 — There is no error state.

`loadGrid` (`:517-530`) catches a failure and calls `toast.error(...)`
(`:521-522`) then falls through to `setLoading(false)` in `finally`. The render
branch is `loading ? … : !gridData || filteredRows.length === 0 ? … : …`
(`:1391-1403`), so a failed load with no prior data shows the **empty** state:
"No subscriber records found" (`:1397-1401`). A network error is presented to
the store owner as "you have no customers", which is the exact failure mode
AGENTS.md warns about ("reads as 'the PR is clean' and hid the failure").

### P8 — No offline handling.

`grep -n 'navigator.onLine\|offline'` finds only the `customerType === 'offline'`
filter — there is no connectivity handling anywhere. A dropped connection is
again indistinguishable from an empty month (P7), and the quick actions
(`:1107`, `:1116`) fire straight at the API with no queue or "will retry" state.

### P9 — Two competing greens, a seven-colour badge palette, and layout jank.

- The primary is teal `#0F766E` in the theme, but the screen paints buttons
  `emerald-600/700` (`:1208`, `:1238`), the delivered badge `emerald-600`
  (`:1670`), and the brand green is `#0C7659` (`theme.ts`) — three greens.
- Status is encoded by hue alone across at least seven families: purple rider
  (`:1709`), teal proof (`:1719`), amber extra (`:1686`), orange plan change
  (`:1663`), red skipped/due (`:1675`, `:1701`), emerald delivered (`:1670`),
  indigo/amber slot (`:1603`). There is no legend.
- `hover: ring-1` (`:986`, note the space after `hover:`) is not a valid
  Tailwind class, so that hover ring never renders — a latent bug in the card
  border hover.
- Cards "sink" completed stops to the bottom (`:1444-1495`) and then the list
  is re-indexed, so the visible sequence numbers do not match the printed route
  sequence; the pending-first sort renumbers via `Seq #` (`:1020`) while the
  route keeps its original order (`:1361-1372`). The store owner has to guess
  which number the rider is actually working.

### P10 — Six equal-weight primary actions in one row, with no hierarchy.

The header (`:1218-1263`) shows Dispatch to Rider (purple), Pack Summary
(amber), Export Sheets (emerald), Fullscreen (outline), Refresh (outline) — five
buttons of the same visual weight plus a view toggle. On a phone they wrap, and
the single most important action for the day (dispatching) does not stand out
from exporting a spreadsheet.

## Before/after mapping

| # | Problem (evidence) | Change | Expected effect |
|---|---|---|---|
| P1 | Day cell is an unfocusable `<td onClick>` (`:1644-1646`); 0 `tabIndex`/`onKeyDown`/`role` | Cell becomes a real `<button>` inside the cell with `aria-label="Day 12, delivered, 1 L, ₹40 cash, 2 extra"`, a roving `tabIndex`, and Enter/Space activation; arrow-key movement across the row | The core task is reachable and operable by keyboard and screen reader |
| P2 | 0 `aria-label`s; icon-only buttons rely on `title` (`:1257-1263`, `:1743-1747`) | Every icon-only control gets a visible text label or an `aria-label` + `title`; stateful filters become `aria-pressed` toggle buttons | Controls announce their name and state; no silent icon-only buttons |
| P3 | Tap targets 22–32px (`:1187-1200`, `:1206-1213`, `:1257-1263`, `:1743-1747`, `:1114-1137`) | All interactive controls ≥44×44px on touch breakpoints; icon glyphs stay small inside a larger hit area | Meets the 44pt minimum; fewer mis-taps at the counter |
| P4 | Headers `Paid`/`Due` (`:1555-1556`) on derived values (`:1734-1738`); money mode by colour only (`:1692-1699`) | Rename to **Cash in** and **Dues**; masthead states the reconciliation rule; day cell shows `₹40 · Cash` / `₹40 · PhonePe`; a one-line legend | Money meaning is explicit and matches the day cells; no colour-only encoding |
| P5 | 7–10px data (`:1663`, `:1686`, `:1709`, `:1719`, `:1574`, `:1583-1586`) | Minimum 12px for data, 13–14px for body, 11px only for non-essential axis labels | Legible at arm's length |
| P6 | Contrast 2.56:1 / 1.51:1 (`:1586`, `:1541`, `:1272`, `:1394`, `:1447`, `:1479`, `:1566`) | Ink ramp from `#0F172A` → `#334155` → `#5A6B7B`; secondary text ≥4.5:1 on paper; today header uses white-on-green ≥4.5:1; 0 `motion-reduce` → add `@media (prefers-reduced-motion)` | All text meets WCAG AA; motion respects user preference |
| P7 | No error state; load failure renders the empty state (`:521-522`, `:1391-1403`) | Distinct error panel with the failure reason, a **Retry** button, and a "last updated" timestamp | A network failure is no longer shown as "no customers" |
| P8 | No offline handling (`grep` finds only the customer-type filter) | Offline banner with last-synced time; quick actions disabled with "will sync when online" copy | The store owner knows why actions are unavailable |
| P9 | 3 greens, 7-colour badge palette, `hover: ring-1` typo (`:986`), renumbered route (`:1020` vs `:1367`) | Single accent (brand green) + one dues red; status also carries an icon and a word; fix the hover class; keep the rider's route number visible alongside the display index | Colour is no longer the only signal; sequence is unambiguous |
| P10 | Five equal-weight action buttons in one row (`:1218-1263`): Dispatch to Rider, Pack Summary, Export Sheets, Fullscreen, Refresh | One filled primary (**Dispatch route**), secondary actions in an overflow menu, filters collapsed behind a "Filters" disclosure | Clear next step; header stops wrapping on phone |

## What I would need to verify before shipping this

1. **Contrast, measured in the browser.** The ratios above are computed from
   Tailwind's literal hex values, not sampled from a rendered page. I could not
   run a headless browser here. Before shipping, sample the real computed
   colours with axe DevTools / Lighthouse on the actual DOM and confirm every
   text pair ≥4.5:1 (≥3:1 for ≥18.66px bold).
2. **Real screen-reader pass.** I have not driven VoiceOver/NVDA over the
   rebuilt grid. The `aria-label` wording, the roving-`tabIndex` order, and the
   arrow-key movement need a manual pass with a screen reader and a keyboard.
3. **Touch measurement on device.** The 44px claim is from the source classes.
   Confirm on a real 360px viewport with the browser's element inspector that
   every control's rendered box is ≥44×44px.
4. **The money reconciliation rule.** I did not re-read
   `reconcileSubscriptionBalance` end-to-end. Confirm that "Cash in" (sum of day
   cells) and "Dues" (reconciled) are the right two labels for what the API
   actually returns, and that a store owner would interpret them as intended.
5. **Reduced-motion.** `prefers-reduced-motion` cannot be toggled in the static
   artifact beyond the CSS I wrote; verify the spin/progress transitions are
   actually suppressed in the app.
6. **Data volume.** The ledger direction assumes the same row count as today.
   Check the redesign at 60+ subscribers and at 31 columns before committing to
   the wider row rhythm.
7. **The `hover: ring-1` typo (P9).** Confirm it is genuinely dead (no
   `hover:ring-1` class) and fix it in the shipped component, not the mockup.

## Token changes against `packages/mobile-shared/src/constants/theme.ts`

The proposal does not discard the brand. It keeps `primary`, `brandGreen`,
`accent`, `error` and `success`, and adds a small, additive set. No existing
token value is changed, so other screens are unaffected.

| Token | Value | Why |
|---|---|---|
| `COLORS.paper` | `#F7F1E6` | Warm ledger surface, replaces the cool `background` on this screen only |
| `COLORS.paperRaised` | `#FFFDF8` | Card / row surface on paper |
| `COLORS.paperEdge` | `#E7DECB` | Hairline rules between rows and day columns |
| `COLORS.ink` | `#1A1613` | Primary text (≈15.5:1 on paper) |
| `COLORS.inkSecondary` | `#4A423B` | Secondary text (≈9.1:1 on paper) |
| `COLORS.inkMuted` | `#6B6157` | Tertiary / axis labels (≈5.3:1 on paper) |
| `COLORS.dues` | `#B42318` | Deep ledger red for outstanding money (≈5.6:1 on paper) |
| `COLORS.duesSoft` | `#F6E2DE` | Dues chip background |
| `COLORS.settledSoft` | `#DCEFE6` | Settled / delivered chip background |
| `FONTS.serif` | `'Iowan Old Style', 'Palatino Linotype', Georgia, serif` | Masthead, day numbers, money |
| `FONTS.sans` | `ui-sans-serif, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` | Body and controls |
| `RADIUS.rule` | `2` | Ledger surfaces are nearly square; keeps brand roundness only on buttons |

Also worth promoting from this screen into the shared theme later (not part of
this mockup): a `STATUS` map that pairs each status with an icon + word +
colour, so no surface can encode status by hue alone again.
