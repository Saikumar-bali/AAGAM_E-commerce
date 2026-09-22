# UX proposal — Customer subscription detail (`SubscriptionDetailScreen`)

Date: 2026-09-22
Branch: `ux-proposals/2026-09-22-subscription-detail`
Artifact: [`mockup.html`](./mockup.html) (self-contained static HTML, no build step)

> This is a design discussion starter. It changes **no** application code. Every
> problem below is cited to a file and line in the current `main` (`dd1500b`).
> Contrast ratios in §2 and §5 were **measured in a headless Chromium render of
> the mockup**, not estimated by hand; the method is described in §5.

---

## 1. Screen chosen and why

**`apps/mobile-customer/src/screens/customer/SubscriptionDetailScreen.tsx`** (1128 lines).

This is the only screen where a milk-subscription customer can act on the
subscription they already pay for: skip the next delivery, pause/resume, report a
delivery problem, change handover preference, show the Trusted-Drop QR, and
cancel. It is high-traffic (the terminal destination of the "My Subscriptions →
detail" path) and high-stakes: money, a recurring household habit, and
irreversible actions live here.

Rotation check: the only prior UX proposal in this repo is
`palette/category-dialog-ux-11210773519304541354` (PR #315, closed — admin
category dialog). No other `ux-proposals/*` branch or PR exists and nothing under
`automations/ux-proposals/` was present at `main`. This screen has not been
proposed before.

---

## 2. Diagnosis with evidence

### P1 — The action bar does not fit a 360 px screen; the 4th action is squeezed

`styles.actions` is `flexDirection: "row", gap: 8` (`:944`) and each `styles.action`
is `flex: 1` (`:945`). For a Trusted-Drop subscription the row renders **four**
actions — Skip next, Pause, Report, Show QR (`:399`–`:448`). At 360 px minus the
`content` padding, four equal columns with 3 × 8 px gaps leave roughly 74 px per
column, while `actionText` is `fontSize: 11, fontWeight: '600'` (`:956`). "Skip
next" and "Show QR" cannot hold one line at that width and must wrap or clip. The
single most consequential row on the screen degrades exactly for the users who
opted into the product's flagship Trusted-Drop feature.

### P2 — "Show QR" gives no on-screen indication that it is working

The button is disabled while pending and swaps its icon to `RefreshCw`
(`:436`–`:445`), but there is **no progress affordance**: `RefreshCw` is not
animated anywhere in the file, the label stays "Show QR", and the only other
feedback is `styles.disabled: { opacity: 0.45 }` (`:1116`). The QR itself comes
from a native call that is awaited (`CustomerQrCode.render`, `:237`, imported
`:49`) before the sheet body appears, so there is a real async gap. On a slow
connection a customer taps, sees a faded button, and cannot tell "working" from
"broken".

### P3 — There is no error state and no way to recover or refresh

The screen branches only on `query.isLoading` (`:283`) and a falsy `query.data`
(`:289`), rendering the bare sentence "Subscription could not be loaded."
(`:292`) with no retry, no cause, and no support path. There is **no
`query.isError` branch anywhere in the file**.

The deliveries query is worse: `deliveriesQuery.isLoading` is checked (`:494`)
but `deliveriesQuery.isError` never is, so a failure falls through to
`visible.map(...)` over an empty array (`:496`–`:499`) and renders an empty
"Calendar & history" section as though the customer simply had no deliveries. A
**false empty state** is worse than an error — it silently misinforms.

The screen also has no `RefreshControl` (verified by grep: no match). Sibling
customer screens do have one, so a user who learned pull-to-refresh elsewhere
will try it here and nothing will happen.

### P4 — No empty state for deliveries

When the list is genuinely empty, the calendar strip is guarded away
(`deliveries.length > 0`, `:489`) and `visible.map` renders nothing, leaving a
titled box with no body (`:482`–`:499`). By contrast the funding-receipts section
at least hides itself when empty (`:502`). The customer cannot tell "no
deliveries yet by design" from "loading failed".

### P5 — No offline handling

`NetInfo` or any connectivity signal is absent from both this screen and
`DeliveryCalendarStrip.tsx` (verified by grep: no match). Every lifecycle action
(skip / pause / resume / report / cancel) is a network mutation whose only
failure path is a transient toast — `notify.error` at `:151`, `:168`, `:201`,
`:214`, `:246`, `:260`, `:277`. Offline, the buttons look fully enabled, the user
taps, and a toast flashes and vanishes. Nothing states that the action needed
connectivity or offers to retry.

### P6 — Ambiguous money presentation

Four different renderings of money, one of them not a number:

| Where | Rendering | Line |
| --- | --- | --- |
| Next-delivery card | `Cash due ₹N` or the sentence `Subscription funded · Customer due ₹0` | `:382`–`:387` |
| Delivery rows | bare `₹N` / `₹0`, no per-row label or column | `:760` |
| Funding receipts | `₹N funded` | `:510` |
| Preferences block | the phrase `Cash every seven deliveries` | `:475` |

`Cash every seven deliveries` never states the amount the customer will hand
over, and `Funded left 4` (`:359`–`:362`) is undefined on screen — the user has
to guess what is left. There is no single reading rule for money on this screen.

### P7 — Low-contrast and below-floor text colours

Computed with the WCAG 2.1 relative-luminance formula against the surface each
token actually sits on:

| Text / element | Style | Ratio | Verdict |
| --- | --- | --- | --- |
| `infoLabel` `#75857E` 10 px on white | `:984` | **3.88** | fails 4.5 |
| `deliveryMeta` `#718079` 10 px on white | `:1012`–`:1014` | **4.15** | fails 4.5 |
| `heroLabel` `#BFEADA` 10 px on `#0F766E` | `:870`–`:872` | **4.17** | fails 4.5 |
| `heroFact` `#CDEEE1` 12 px on `#0F766E` | `:906` | **4.41** | fails 4.5 |
| Ring border `#65C7A7` on `#0F766E` | `:883`, `:888` | **2.68** | fails 3:1 UI floor |
| Report icon `#B96600` on white | `:431`, `:471` | **4.23** | fails 3:1 UI floor |
| Strip weekday / empty text `#94A3B8` | `DeliveryCalendarStrip.tsx:218`, `:244` | **2.45** | fails 4.5 |

This is partly a **token-level** problem: `theme.ts` ships
`textMuted: '#94A3B8'`, which is **2.45:1** on `theme.ts:background '#F8FAFC'` —
below AA wherever it is used as text. Several labels are additionally 9–10 pt
(`:857`, `:872`, `:927`, `:943`, `:984`, `:1013`, `:1029`), so small size and low
contrast compound.

### P8 — Missing accessibility labels, roles, and selection state

- The back button has **no `accessibilityLabel` and no `accessibilityRole`**
  (`:320`) — a screen reader announces an unlabelled button. The header's other
  icon button *is* labelled (`:330`), so the omission looks accidental.
- The lifecycle actions (`:399`–`:448`) are `Pressable`s with no
  `accessibilityRole`; their only name is inner text.
- The issue-type chips (`:544`–`:568`) have **no selected-state announcement**.
  The active chip is encoded by border and background colour alone
  (`styles.chipActive`, `:1095`), a WCAG 1.4.1 "colour alone" failure for both
  colour-blind and screen-reader users. Grep confirms no `accessibilityState`,
  `accessibilityRole`, or `selected` prop is used anywhere in the file.
- The "Edit" link (`:453`–`:455`), the "View all / Show less" toggle (`:483`),
  and the sheet close button (`:1075`–`:1080`) are unlabelled text-only
  `Pressable`s; the close button has no `hitSlop`.

### P9 — Sub-44 pt tap targets

- `styles.link: { color, fontWeight }` (`:975`) carries no `minHeight` and no
  `hitSlop`, so the "Edit" / "View all" links render at roughly 17–20 pt tall.
- Chips: `styles.chip: { minHeight: 40 }` (`:1086`) — 40 pt, under the 44 pt floor.
- Sheet close: `width: 42, height: 42` (`:1075`–`:1077`) — 42 × 42.
- Calendar month arrows: `navButton: { width: 36, height: 36 }`
  (`DeliveryCalendarStrip.tsx:214`) — 36 × 36.
- The calendar conveys **status** with a 6 × 6 px dot whose only channel is
  colour (`DeliveryCalendarStrip.tsx:161`, `:188`).

### P10 — Loading states are bare spinners with no layout reservation

`query.isLoading` renders an `ActivityIndicator` (`:283`–`:288`) and the
deliveries section does the same (`:494`), each replacing the whole layout, so
content jumps when data lands. There is no skeleton.

### P11 — The flow makes the user guess

- The Trusted-Drop mode is only discoverable by tapping "Show QR" (`:436`); the
  preferences summary never states the handover mode in words.
- "Track" (`:391`–`:397`) is always enabled even when there is no active
  delivery to track, so its failure is discovered late.
- Domain jargon ("Funded left", "Cash every seven deliveries") is never explained
  inline.

### P12 — Motion is not gated

The QR sheet uses `animationType="slide"` (`:785`) and the progress fill animates
(`:356` region), with no `prefers-reduced-motion` / `isReduceMotionEnabled()`
check anywhere in the file.

### P13 — The action sheet makes the user guess what it will do, and mishandles the disabled state

Every one of the four sheets (issue, preferences, cancel, trusted QR) is built by
one shared `ActionSheet` (`:770`–`:806`) and shares the same three weaknesses.

- **The destructive confirm cannot be read and cannot be explained.** The confirm
  button is `styles.dangerButton: { backgroundColor: '#A73535' }` (`:1114`)
  rendered at `styles.disabled: { opacity: 0.45 }` (`:1116`) while the reason is
  empty. Compositing `#A73535` at 45 % over white gives `#D7A4A4`, so the white
  label sits at **2.16:1** — the user cannot read the very button they are being
  asked to decide about. Worse, the disabled state carries **no reason**: the
  customer sees a greyed button with no statement of what is required.
- **The close control is an unnamed glyph with no dismissal contract.** The
  `X` (`:1076`–`:1078`) is 42 × 42 (`styles.close`, `:1075`–`:1077`), under the
  44 pt floor, and the `Pressable` has no `accessibilityLabel` and no `hitSlop`.
  Its only accessible name is the icon. There is also a bare `modalDismiss`
  `Pressable` behind the sheet (`:789`) with no label at all, so a screen reader
  can land on an unnamed full-screen button.
- **The sheet never states the consequence of the destructive action.** The
  cancel sheet's copy is generic (`styles.sheetCopy`, `:1081`, ~12 px); nothing
  says what happens to money already paid, what happens to generated orders, or
  how many funded deliveries the customer keeps. The customer must decide to
  cancel from a title and a reason box.

### P14 — Every primary action is below the fold, and the one umbrella action is unnamed

`Cancel subscription` is the *last* child of the outer `ScrollView`
(`:526`–`:533`), after the hero (`:342`), next-delivery card (`:363`), action bar
(`:398`), preferences (`:455`), calendar and history (`:485`), and funding
receipts (`:502`). On a common 360 × 640 handset the scroll content runs well past
one viewport, so a customer who opens this screen lands on the hero and sees
**no** actionable control near the thumb: "Track" is the first action and it
appears around `:391`. The most-used actions (skip next delivery, pause) and the
most consequential one (cancel) all require a scroll before the customer even
knows they exist. The "Show QR" capability is likewise only discoverable by
scrolling to the action bar and then reading an unlabelled-in-words icon.

This is the structural version of the problem the task brief calls out: on a
common device the primary action is not reachable without discovery work. §3's
ledger head and persistent action dock exist specifically to pull the next
delivery, the money owed, and the two most common actions above the fold.


---

## 3. Aesthetic direction

**"Morning ledger."** A calm, paper-warm, high-legibility household log — the
feel of a well-kept daily accounts book rather than a SaaS dashboard.

Why this fits AAGAM rather than a generic restyle:

- AAGAM's brand is already a deep teal (`theme.ts:primary '#0F766E'`), and the
  product's core ritual — a delivery before dawn, a cash handover at the door —
  *is* a daily ledger ritual. The current screen reaches for a generic
  card-dashboard idiom (ring gauge, four equal tiles); the ledger direction leans
  into what the product actually is.
- The user is often at a door at 6 a.m., one hand on a milk packet. Warm paper
  surfaces and near-black ink maximize legibility in bright outdoor light and
  *reduce* the reliance on colour to carry meaning — exactly what P7/P8 are about.
- Deliberate, specific choices: a warm paper base (`#FAF7F2`) instead of the cold
  `#F8FAFC`; a deeper brand teal (`#0B4F46`) so white labels pass AA; a single
  warm amber accent reserved **only** for money owed, so amber never competes
  with teal; a serif-flavoured display face for plan/sequence numerals to give
  the screen a ledger's character; status **words** instead of status dots.

Anti-generic guard-rails I am deliberately avoiding: no purple gradients, no
glassmorphism, no `Inter`/`Roboto` house look, no evenly-distributed pastel
palette, no emoji. The system font stack is used as the accessible fallback
underneath an intentional display face.

Structural moves (not just paint):

1. A **ledger head**: plan name with a real "Day 12 of 24" figure, and the term
   rendered as a horizon strip instead of a ring gauge.
2. A **horizon rail** on the left spine showing position in the term — replaces
   the decorative ring, which encodes a percentage the text already states.
3. An **action bar that cannot clip**: primary actions as full-width rows, a
   secondary row of equal ≥46 pt tiles, and a `More` grouping so four actions
   never fight over 74 px.
4. **Status words + shape**, not dots: each delivery row carries a word badge
   whose meaning survives greyscale.
5. **One money rule**: every rupee figure sits in a right-aligned `Amount` column
   with an explicit unit, and money owed is the only amber element.
6. **The sheet is a page of the ledger, not a detached popup**: it opens anchored
   to the scrimmed ledger head it acts on, leads with a plain-language
   consequence block written like a ledger note, and disables its confirm by
   *state* (ink stays readable) with the blocking requirement spelled out in
   words rather than faded away.

---

## 4. Before / after mapping

| # | Problem (evidence) | Change | Expected effect |
| --- | --- | --- | --- |
| P1 | 4 actions × ~74 px at 360 px; labels clip (`:944`, `:945`, `:956`, `:399`–`:448`) | Two full-width primary rows, a 2-up secondary row of equal ≥46 pt tiles, and the 4th action moved into an explicit `More` list; `minWidth` replaces `flex: 1` equality | No truncation at 360 px; every action keeps a ≥46 pt target |
| P2 | Show QR has no progress state (`:436`–`:445`) | QR becomes a labelled button with a real spinner, a "Preparing your QR…" inline status, and an inline success/failure result with Retry | The user can distinguish working from stuck without leaving the screen |
| P3 | No `isError` branch; delivery-query errors render a false empty (`:289`–`:294`, `:494`–`:499`); no refresh | Explicit error variant per query, each with Retry, a plain-language cause, and a support link; pull-to-refresh added; inline retry too | A failure can no longer masquerade as "you have no deliveries"; recovery is one tap |
| P4 | Empty deliveries render an empty titled box (`:482`–`:499`) | Purpose-written empty state: says the plan has no scheduled delivery yet, shows the next expected window, offers "View plans" | The customer knows whether this is normal or a problem |
| P5 | No connectivity signal anywhere; failures are fleeting toasts (`:151`–`:277`) | Persistent offline banner, plus actions that queue with an explicit "will send when back online" state and online-only actions disabled with a reason | Offline becomes a visible state instead of a disappearing toast |
| P6 | 4 money representations, one non-numeric (`:382`–`:387`, `:510`, `:475`, `:760`) | One right-aligned `Amount` column; `Due now ₹40` / `Prepaid ₹0`; funding summarised as `₹280 prepaid · covers days 1–7`; "Funded left" reworded to "Deliveries still prepaid" with an inline explainer | One reading rule for money; no domain guessing |
| P7 | 7 contrast failures incl. 2.45 and 2.68 (`:984`, `:1012`, `:870`, `:906`, `:883`; strip `:218`, `:244`); control edges only ~1.5:1 | Token-level fixes (§6); text pairs measured ≥ 4.5:1; interactive boundaries moved to dedicated `controlEdge`/`dangerEdge` tokens, measured ≥ 3:1; the decorative rail track and badge fills stay soft on purpose (§5 note) | Meets AA at normal text size; every button and meter boundary is visible to low-vision users |
| P8 | Unlabelled back/chips/close/edit; colour-only selection (`:320`, `:544`–`:568`, `:453`, `:1075`) | Real `accessibilityLabel` / `accessibilityRole` / `accessibilityState={{selected}}`; selected chips gain a check glyph and a weight change; close gains `hitSlop` | Screen-reader users can identify and operate every control; selection survives greyscale |
| P9 | Sub-44 pt targets: `link` ~17–20 pt, chips 40 pt, close 42 pt, strip nav 36 pt, 6 px dots (`:975`, `:1086`, `:1075`, strip `:214`, `:188`) | Text links become 46 pt rows or gain `hitSlop` to 46; chips and close → 46 pt; strip nav → 46 × 46; status dots replaced by labelled badges | Meets the 44 pt minimum; calendar status readable without colour |
| P10 | Bare spinners, layout jump (`:283`, `:494`) | Skeletons that reserve the real layout's height | No content jump; perceived load feels shorter |
| P11 | Undiscoverable QR mode; jargon; always-enabled Track (`:391`–`:397`, `:359`, `:475`) | Preferences summary states the mode and its consequence in words; jargon replaced or explained inline; Track disabled with a reason when there is no active delivery | The user stops discovering capability and failure by trial and error |
| P12 | Ungated slide animation (`:785`) | `prefers-reduced-motion` honoured in the mockup; recommendation to gate the RN sheet on `AccessibilityInfo.isReduceMotionEnabled()` | Motion-sensitive users are not forced through slide transitions |
| P13 | Confirm button unreadable at 2.16:1 when disabled (`:1114`, `:1116`); close is a 42 pt unnamed glyph with no `hitSlop` (`:1075`–`:1078`); unnamed full-screen dismiss `Pressable` (`:789`); sheet never states consequence (`:1081`) | Confirm keeps full-opacity danger ink and is disabled by *state*, not transparency, with the blocking requirement stated in words and a live count; close becomes a 46 pt labelled control with `accessibilityLabel`; the scrim dismiss gets a label; the sheet opens with a plain-language consequence block and a money/keep summary before the reason field | The destructive decision is legible in every state, no unnamed control exists, and the user knows exactly what cancelling does before they confirm |
| P14 | No action is reachable in the first viewport; `Cancel subscription` is the last scroll child (`:526`–`:533`); first action at `:391`; four actions share one `flex:1` row (`:944`, `:945`) | Ledger head + next-delivery amount card put schedule and money at the top; the two most common actions become a persistent, full-width action dock pinned above the safe area; secondary and destructive actions move into a labelled `More actions` sheet | The user sees what is next, what it costs, and the two actions they came for without scrolling; nothing important is discoverable only by exploration |

---

## 5. States rendered, and what I measured

The mockup renders **Default, Loading, Empty, Error, Offline, Cancel sheet** for
the redesign, side by side with a faithful reconstruction of the current screen,
at 360 px and at desktop width.

I verified the artifact in headless Chromium rather than asserting it renders.
Measurements below are from a single automated run that drives each state by
setting `.st-*` radio, then walks every text node and every control inside the
proposed and current viewports.

| Check | Method | Result |
| --- | --- | --- |
| Renders at exactly 360 px | `getBoundingClientRect().width` of the phone frame | 360.0 px for both panels |
| State exclusivity | count visible `.st-*` blocks per selected state | exactly 1 of 6 visible in every state; sheet closed in all five base states |
| Contrast (text, WCAG 2.1) | per-element walk compositing `color` over the real painted background stack, large-text threshold applied | **proposed: 0 failures in all 6 states** (254 text nodes measured). Current reconstruction: **31 failures across 5 states** (17 default, 1 loading, 4 empty, 1 error, 8 offline) |
| Contrast detail (current, worst cases) | as above | `#94A3B8` weekday labels on white **2.56:1** (11 px); `#75857E` `Window`/`Handover`/`Funding` labels **3.88:1**; `#718079` row meta **4.15:1**; loading/error body `#75857E` on `#F4F8F6` **3.62:1**; `#BFEADA` on the teal header **4.17:1**; `#CDEEE1` on teal **4.41:1**; offline body on the danger-soft surface **3.95:1** |
| Tap targets | every `button`/`a`/`input`/`[role=button]` in each proposed state | **0 controls under 44 px in all 6 states** (smallest measured target is 46 px) |
| Accessible names | every proposed `button` has a non-empty accessible name | 0 unnamed in all 6 states |
| Money alignment | right edge of each `Amount` cell | all three rows share one right edge, i.e. true column alignment |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` block covering the shimmer, spinner and QR-busy animations | block present at `mockup.html:779`; **not** exercised (headless Chromium ran at the default motion setting, so the switched-off rendering is unverified — see §7) |
| Offline affordance | `.st-offline .banner` visibility in the Offline state | visible; its `Retry` action re-measured at 44 px after an earlier 24 px draft |
| Horizontal overflow at 360 px | count elements whose `getBoundingClientRect().right` exceeds the viewport, in every state | 0 overflowing nodes in all states. This check caught a real defect in an earlier draft: the cancel sheet's sticky action bar sat directly in `.sheet` (which has no horizontal padding) while still carrying the `-18px` side margins meant for a padded parent, so it hung 18 px per side past `overflow:hidden` and truncated the `Confirm cancellation` label; its `-20px` bottom margin also pushed 20 px of content past the clipped edge. Fixed by zeroing both margins and giving the scroll body `min-height:0` / the header `flex:0 0 auto`. Re-measured: sheet overflow **0 px**, clipped content **0 px**, label **not clipped** |
| Sheet scroll integrity | `scrollHeight - clientHeight` on `.sheet` after selecting the Cancel sheet state | **0 px** of clipped content; the scrollable `.sheet-body` absorbs the overflow instead of the sheet box hiding it |
| Focus styling present | count of `:focus-visible` selectors in the stylesheet | 16 selectors, covering primary, ghost, chip, row and sheet controls; keyboard focus is not silently removed |
| ARIA surface (proposed panel only) | count of `aria-label` / `role="status"` / `aria-live` / `aria-hidden="true"` / `aria-pressed` inside `<section class="col proposed">` (`mockup.html:1159`) | 7 `aria-label`, 3 `role="status"`, 1 `aria-live`, 6 decorative nodes hidden from the tree, 4 `aria-pressed` for the pause/resume/skip toggles |

The contrast check is a real measurement of the painted stack, but it is a
*headless browser* measurement — see §7 for what it still cannot prove.

### Note on the two decorative elements below 3:1 (`mockup.html:402`, `mockup.html:546`)

The non-text sweep flagged two things that are **not** covered by 1.4.11 and are
left below the floor on purpose:

- The **rail track** (`.rail .bar`, `mockup.html:402`) against the card it sits on
  measures 1.14:1. The track is
  not a control and carries no information; the *fill* against the track is what
  encodes progress, and that pair measures 8.13:1. Raising the track would turn
  a quiet progress rail into a heavy box, so the boundary is intentionally soft
  and the fill does the work.
- **Badge backgrounds** (`.badge`, `mockup.html:546`) against the card measure
  1.14–1.19:1. The badge ink against
  its background is the meaningful pair and measures 6.45–7.32:1. The badge is
  set off by its own rounded fill and by the adjacent text, not by a border.

Both are judgement calls a reviewer should confirm with a sighted low-vision
check rather than take from a ratio alone — see §7.

---

## 6. Token changes against `packages/mobile-shared/src/constants/theme.ts`

Proposed as **additive** tokens. Existing keys stay in place so nothing breaks
during a gradual migration. In particular `textMuted: '#94A3B8'` is kept for
non-text decoration; the places that use it as *text* should move to `inkMuted`.

```ts
export const COLORS = {
  // --- unchanged brand anchors ---
  primary: '#0F766E',
  primaryLight: '#CCFBF1',
  primaryDark: '#115E59',
  accent: '#14B8A6',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',   // 2.45:1 on #F8FAFC — keep for decoration only
  border: '#E2E8F0',
  error: '#DC2626',
  success: '#10B981',
  warning: '#F59E0B',
  white: '#FFFFFF',
  dark: '#0F172A',
  darkCard: '#101827',

  // --- proposed additions (pairs measured against paper AND white) ---
  // "Morning ledger" surface family
  paper: '#FAF7F2',          // warm base, replaces #F8FAFC on this screen
  paperRaised: '#FFFDF9',    // card surface on paper
  rule: '#E7DFD3',           // 1px hairline "ledger rule"
  ruleStrong: '#D8CDBC',     // decorative dividers ONLY — 1.5:1, not a control edge

  // Interactive boundaries (WCAG 1.4.11, non-text, ≥3:1).
  // A decorative rule and a control outline have different jobs: #D8CDBC reads
  // fine as a table divider but fails as a button edge at 1.5:1. Controls get
  // their own token so that lightening the ledger rules later cannot silently
  // push a button under the 3:1 floor.
  controlEdge: '#93836D',    // 3.4:1 on paper, 3.6:1 on paperRaised, 3.2:1 on brandSoft
  dangerEdge: '#B96E6E',     // 3.6:1 on paper, 3.2:1 on dangerSoft — destructive buttons

  // Ink
  ink: '#0B2A22',            // 14.4:1 on paper, 15.4:1 on white
  inkSecondary: '#4A5C55',   // 6.7:1 on paper, 7.1:1 on white
  inkMuted: '#55655F',       // 5.8:1 on paper, 6.2:1 on white
                             //   replaces #75857E / #718079 / #65766F as text

  // Brand, deepened so white labels pass AA
  brand: '#0B4F46',          // white on brand = 8.5:1
  brandSoft: '#E3F1EC',
  onBrand: '#F0FDFA',        // 9.1:1 on brand
  onBrandMuted: '#C7F0E2',   // 7.7:1 on brand
  onBrandFaint: '#9FE3D0',   // 6.5:1 on brand

  // Semantic, tuned for AA on both paper and white
  cashDue: '#8A4B00',        // 6.8:1 on white — the only amber money accent
  cashDueSoft: '#FBEEDC',
  successText: '#0B6B4F',    // 6.5:1 on white
  dangerText: '#9F1F1F',     // 7.8:1 on white
  link: '#0B5F57',           // 7.0:1 on white — darker than primary for links

  // Focus
  focusRing: '#0B4F46',
  focusRingOffset: '#FAF7F2',

  // Status (word-badge) pairs — badge background / badge ink
  statusDeliveredBg: '#DFF3EA', statusDeliveredInk: '#0B5F45',
  statusScheduledBg: '#E6EDF9', statusScheduledInk: '#274B86',
  statusSkippedBg: '#FBEEDC',   statusSkippedInk: '#7A4A12',
  statusFailedBg: '#FBE7E7',    statusFailedInk: '#8F2323',
  statusCancelledBg: '#ECEDEF', statusCancelledInk: '#4B5563',
};

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const BORDER_RADIUS = {
  sm: 10, md: 16, lg: 20, xl: 28, pill: 999,
  // proposed
  ledger: 6,   // crisp, book-like corners for data rows
  chip: 12,
};

export const SHADOWS = {
  card: { /* unchanged */ },
  elevated: { /* unchanged */ },
  // proposed: ledger rows are separated by rules, not shadows
  rule: { elevation: 0 },
};

export const FONTS = {
  regular: { fontWeight: '400' as const },
  medium: { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold: { fontWeight: '600' as const },
  // proposed
  displayNumeral: { fontWeight: '600' as const, letterSpacing: -0.5 },
};

export const TYPE = {
  // the current screen mixes 9/10/11/12/13 pt ad hoc; this is an explicit scale
  micro: 11,   // was 9–10 (see :857, :872, :927, :943, :984, :1013, :1029)
  caption: 12,
  body: 14,
  bodyLg: 16,
  title: 20,
  display: 30,
  minBodyPt: 13,
  tapTarget: 46,  // ≥44 pt with headroom for Android font-scale rounding
};
```

Notes:

- `TYPE.micro: 11` deliberately raises the 9–10 pt labels listed above. Small
  type was an independent second contributor to P7.
- `TYPE.tapTarget: 46` is set above the 44 pt floor so that Android font scaling
  has headroom before a target drops under the minimum.
- All ratios in the comments are against the surfaces named; the
  `statusDeliveredBg`/`Ink` style pairs are measured as pairs (background and
  foreground changing together), which is why they can be lighter than the
  single-token replacements.

---

## 7. Honest "what I would need to verify before shipping this"

I could not run any of the following; each is a real gate, not a formality.

1. **Native screen-reader output.** I can prove the HTML carries accessible
   names, but I cannot run VoiceOver (iOS) or TalkBack (Android) against RN
   `Pressable`s. Unverified in particular: whether `accessibilityState={{selected}}`
   on the issue chips is announced, and whether delivery rows are read as one
   grouped item or as five separate stops.
2. **Tap-target geometry on a real device.** My ≥46 pt claims for the redesign
   are CSS-derived from a headless render. On Android, `minHeight` can be
   defeated by large system font scaling; I have not measured at 200 % text with
   TalkBack, which is where the action bar is most likely to re-clip.
3. **Contrast on a physical panel.** §5 measures the painted CSS stack in
   Chromium, which is a genuine improvement over hand arithmetic but is still not
   a colorimeter. An OLED panel at 30 % brightness in outdoor light can change how
   the warm `#FAF7F2` paper reads, and paper-on-brand text is more gamma-sensitive
   than white-on-brand. Needs a device spot-check.
4. **Dynamic type / large text.** No current style sets `allowFontScaling`
   controls. I have not verified that the ledger head, horizon rail, and money
   column reflow instead of overlapping at the largest accessibility text size.
5. **Reduced motion in React Native.** The mockup honours
   `prefers-reduced-motion` in CSS, but RN does not consume that media query.
   Shipping P12 requires wiring `AccessibilityInfo.isReduceMotionEnabled()` and
   its change event into the sheet `animationType` — a code change I deliberately
   did **not** make here.
6. **Keyboard / switch-access reachability.** Android RN supports keyboard
   navigation. I have not confirmed focus order through the new `More` group, nor
   that the QR sheet traps focus correctly on dismissal.
7. **Offline behaviour against the real client.** I did not read
   `subscriptionService`'s retry or queue semantics, so "queues the action and
   sends when back online" (P5) is a design proposal, not a verified capability.
   If the client has no outbox, the honest interim is *disable with a reason*, not
   *queue*.
8. **Whether "Deliveries still prepaid" is the correct domain term.** I inferred
   the meaning of `remainingFundedDeliveries` (`:362`) from its usage; a product
   owner should confirm the wording against how store and support staff speak.
9. **Colour-blind simulation.** The status badges are word-bearing, which should
   clear the 1.4.1 failure, but I have not run the palette through a
   deuteranopia/protanopia simulation to confirm the amber money accent stays
   distinguishable from the teal brand.
10. **Calibration of the current-screen reconstruction.** The "current" panel in
    the mockup is a static HTML reconstruction of RN styles, not a screenshot of
    the running app. Its 10 measured contrast failures correspond to the real
    hex values at the lines cited in P7, but the reconstruction cannot prove
    fidelity of spacing or exact layout. A real device screenshot should replace
    it before this goes further.
11. **Performance of the paper treatment.** The texture is CSS-only in the
    mockup; on RN it would need a lightweight implementation or omission, and I
    have not profiled it.
12. **Non-text contrast on a real panel.** The `controlEdge`/`dangerEdge` ratios
    in §5/§6 come from computed CSS colours over the painted stack. WCAG 1.4.11 at
    a 1 px hairline is genuinely borderline on a low-quality panel or with
    subpixel rendering, and an OLED at low brightness can wash a 1 px edge out.
    Confirm the button outlines at 3.16:1 by eye on the lowest-grade device in
    support before treating this as closed. The two decorative elements left below
    3:1 in §5 also need a sighted low-vision check — a ratio alone cannot tell me
    whether the series coder still separates them in practice.
13. **That the boundary tokens survive a theme change.** `controlEdge` was split
    out precisely so that decorative rules can be lightened without silently
    breaking a button. I have not exercised a second theme (e.g. dark mode) to
    confirm the token is remapped there rather than inherited.

---

## 8. What this PR deliberately does not touch

- No files under `apps/*`.
- No routing, navigation params, state management, API calls, `package.json`, or
  native configuration.
- `packages/mobile-shared/src/constants/theme.ts` is **unchanged**; §6 is a
  written proposal for review, not an applied edit.
- Only two files are added: this document and `mockup.html`.
