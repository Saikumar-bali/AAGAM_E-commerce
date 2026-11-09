# UX proposal: Rider COD ledger (`RiderCodScreen.tsx`) — 2026-11-09

## 1. Screen chosen

`apps/mobile-partners/src/screens/rider/RiderCodScreen.tsx` — the rider
**cash-on-delivery (COD) ledger / cash accountability** screen in
`apps/mobile-partners`. A rider opens it from the Profile tab
(`RiderProfileScreen.tsx:178`, "COD ledger — Deposits, settlements, variance and
receipts") to answer two questions: *how much cash am I holding right now?* and
*is any of it disputed or unaccounted for?*

**Why this screen, and why now**

- **Rotation.** The remote `ux-proposals/*` branches already cover
  `2026-09-…-subscription-detail`, `2026-09-28-rider-run-detail`,
  `2026-10-05-milk-delivery-grid`, `2026-10-12-checkout` and
  `2026-10-26-order-tracking`. None of them touch cash accountability, and this
  screen has never been proposed. It is the next high-traffic, user-visible
  surface on the candidate list.
- **Highest stakes of any rider screen.** COD cash is real money the rider is
  personally accountable for. Every figure on this screen is a liability number;
  a misread amount is a dispute with the store, a short deposit, or a rider
  penalised for money they never lost. This is exactly the surface where an
  interface failure has a financial consequence.
- **It carries the app's worst text legibility and worst money framing.** The
  screen compresses a whole ledger into 5 distinct `fontSize: 9` label styles
  (`RiderCodScreen.tsx:202,206,207,208`) and prints a bare "Variance" figure with
  no sign semantics, no plain-language meaning and no next step (`:93`,`:139`).
- **It is the canonical specimen of a wider pattern.** The problems here
  (10px labels, a `4.27:1` header eyebrow, an error state with no retry, no
  offline handling) recur across the partner workspace, so a fix here is a
  template for the rest of `apps/mobile-partners`.

**What it is not.** This is a mockup pass only. No application code is changed.
The redesign keeps the existing data contract
(`riderService.getCodLedger` → `GET /riders/portal/cod`,
`apps/api-gateway/src/riders/rider-portal.service.ts:470-505`) and reuses every
behaviour the screen already has.

---

## 2. Diagnosis with evidence

All line numbers are `apps/mobile-partners/src/screens/rider/RiderCodScreen.tsx`
unless stated otherwise. Contrast ratios were computed from the literal hex
values in the file with the WCAG 2.1 relative-luminance formula; the arithmetic
is reproduced in §7.

| # | Problem | Evidence (file:line) | Why it hurts |
|---|---------|----------------------|--------------|
| **P1** | **Labels are set at 9–10px — below every legibility floor.** Five separate style objects set `fontSize: 9` (`summaryLabel:202`, `amountLabel:206`, `factLabel:207`, `auditMeta:208`) plus `heroLabel:201` and `filterText:203` at `10`, and `eyebrow:198` at `9`. That is 5 uses of `fontSize: 9` in a 212-line file. | styles `198,201,202,203,206,207,208`; used `84,91,105,124,131,137,146,148` | The words that give the numbers meaning ("Expected", "Collected", "Holding", "Settlement reference") are the smallest text on the screen. A rider reading a phone in daylight, one-handed, on a scooter, is being asked to read the least legible text in the app to check their cash. |
| **P2** | **The header eyebrow and hero label fail 4.5:1 against the teal chrome.** `#A7F3D0` on `#0F766E` is **4.27:1**. It is used for `eyebrow:198` ("RIDER CASH ACCOUNTABILITY") and `heroLabel:201` ("CASH CURRENTLY HELD") — the two strings that name the screen and the amount. | styles `198`, `201`; header gradient `64` (`preset="teal"`, `GradientSurface.tsx:14` starts at `#0B3B36` → `#0F766E` → `#12897F`) | The label above the most important number on the screen misses AA. It is worst exactly where the gradient is lightest. |
| **P3** | **"Variance" is printed as a bare, unsigned rupee figure with no meaning and no next step.** `Summary label="Variance" value={money(data.variancePaise)}` (`93`) and `Fact label="Variance" value={...}` (`139`) both run the value through `money()` (`26-31`), which uses `minimumFractionDigits: 2` and never emits a `+`/`-`. The only non-zero styling is `warning`/`danger` colour (`93`,`139`, `182-183`,`190-192`). | `26-31`, `93`, `139`, `182-192` | "Variance ₹0.00" vs "Variance ₹-250.00" vs "Variance ₹250.00" are three completely different situations (balanced / rider short / rider over) and the screen distinguishes them only by colour and a minus sign a rider may not notice. There is no sentence saying which way the money went, and no instruction for what to do. |
| **P4** | **The error state is a dead end.** `query.isError` renders a title and `(query.error as Error)?.message || 'Pull down to retry.'` with **no button** (`113-114`), even though the query exposes `refetch` and a button is used elsewhere in the same app for exactly this (e.g. `MySubscriptionsScreen.tsx:58`). The only recovery is the pull-to-refresh gesture, which the copy names but does not offer as a control. | `113-114`; `refetch` at `72`,`79` | On a failed load a rider sees raw error text (possibly a stack-style message) and is told to perform a gesture that is invisible and undiscoverable. |
| **P5** | **The error branch leaks raw exception text to the user.** `(query.error as Error)?.message` (`114`) prints whatever the API client threw — a network error, a 500 body, a Prisma message — into the rider's UI. | `114` | Untranslated developer text in a money surface; it also can reveal internals. |
| **P6** | **No offline handling, and the app has no connectivity signal to build one from.** `@react-native-community/netinfo` is not imported anywhere in `apps/mobile-partners/src` and is **not** a dependency of `apps/mobile-partners/package.json` (grep returns nothing). Other rider screens that need this faked it with a local online/offline toggle (`RiderJobsScreen.tsx:151`), so the ledger simply cannot tell the rider the data is stale. | absence of `NetInfo` (verified by grep over `src` and `package.json`); contrast with `RiderRunConsole.tsx:68-74` which has a real offline queue | A rider at the store door with no signal sees the last-cached "CASH CURRENTLY HELD" figure with no indication it is stale. They may hand over the wrong amount. |
| **P7** | **Filter chips are `minHeight: 38` — below the 44pt touch floor.** `filter: { minHeight: 38 ... }` (`203`), and the chips sit in a horizontal scroller (`96`). | style `203`; used `98-107` | The status filter is the primary navigation on this screen and its targets are 6pt short of the platform minimum, on a horizontally-scrolling rail where mis-taps are most likely. |
| **P8** | **The filters are a guess-the-word puzzle.** The chips render `label(value)` (`105`), which is `String(value).replaceAll('_',' ')` (`33-35`), over the raw enum set `ALL, HELD, PARTIAL, SETTLED, VARIANCE` (`41`,`97`). "HELD" and "PARTIAL" do not map to the ledger statuses they filter (`HELD_BY_RIDER`, `PARTIALLY_DEPOSITED`, `55-56`), and "VARIANCE" filters `VARIANCE_REVIEW`. | `33-35`, `41`, `53-59`, `97-107` | The rider has to translate app vocabulary ("PARTIAL") into ledger vocabulary ("partly deposited") and guess which chip shows the money they are worried about. |
| **P9** | **The loading state is a bare spinner with no skeleton, it replaces the whole page body, and — worse — the hero renders a false `₹0.00` while loading.** `data` defaults to `{}` (`51`), so during `query.isLoading` `data.cashHeldPaise` is `undefined`; `money()` coerces that to `0` (`26-31`) and the hero prints **"CASH CURRENTLY HELD ₹0.00"** (`85`) before the real figure arrives. The list area simultaneously shows a centred `ActivityIndicator` + "Loading COD account…" (`111-112`). | `51`, `85`, `26-31`, `111-112`; `state:201` | A rider who glances at the screen mid-load reads a **false zero cash balance** on a money-accountability surface. This is the most dangerous defect on the screen: it is a wrong number presented as fact, not merely an ugly one. |
| **P10** | **The empty state is only reachable through a filter, and never explains the good case.** `visible.length === 0` says "No matching COD entries — Change the status filter to review other settlements." (`115-116`). A brand-new rider with a genuinely empty ledger (no COD orders yet) sees the same message and is told to change a filter that has nothing to change. | `115-116` | A first-time rider is told their empty account is a filtering problem. |
| **P11** | **The variance warning colour is duplicated and inconsistently named.** `styles.danger` (`207`) is `#B91C1C` and is applied to the variance `Fact` (`139`), while the summary uses a separate `warning` prop (`93` → `183` → `styles.danger`) — the prop is called `warning` but renders `danger`. | `93`, `139`, `182-183`, `190-192`, `207` | The same value can read amber-ish or red depending on which row it is in, and the naming makes it easy for the next change to drift them apart. |
| **P12** | **The "needs action" banner is a paragraph of policy text, not an action.** `needsAction` renders a note: "Cash settlement is completed by the store or admin. Keep the physical deposit receipt and use Support if the reference, partial amount, or variance is incorrect." (`173`) — the two real actions ("Receipt", "Job support" / "Dispute variance") sit *above* it (`154-172`). | `154-173` | The instruction that tells the rider what to do arrives after the buttons that do it, and it is styled as fine print (`fontSize: 10`, `210`). |
| **P13** | **The one clear task — deposit the cash — has no home on this screen.** The hero says "Deposit only against a recorded settlement reference." (`86`) and the note says settlement "is completed by the store or admin" (`173`), but the screen offers no path to the deposit flow, no reference to copy, and no way to see which batch the held cash belongs to. | `86`, `137`, `173` | The rider's single obligation is stated twice and actionable nowhere. |

**Things the screen already does right (kept, not discarded).** A real loading
branch (`111`), a real error branch (`113`), a real empty branch (`115`),
pull-to-refresh plus a header refresh button (`72`,`79`), `accessibilityRole` and
`accessibilityLabel` on the header buttons (`65`,`72`) and
`accessibilityState={{ selected }}` on the filters (`101`), a `selectable`
attribute on copyable facts and references (`148`,`191`), a horizontal filter
rail that scrolls rather than wraps (`96`), and a data contract that already
returns `pendingHandovers` (`rider-portal.service.ts:497-501`) which the UI
currently ignores. The redesign reuses all of this and changes only
presentation and copy.

---

## 3. Aesthetic direction

**"Cash Book" — a physical petty-cash ledger with rubber-stamped status.**

The reference is the *khata* / cash-book a small trader in Anakapalle actually
keeps: a ruled page, a running balance, a stamped "SETTLED", a red entry for a
shortfall. That artefact is already the mental model for "money I am holding and
must account for", so the redesign borrows its grammar rather than inventing a
dashboard.

**Why it fits this product.**

- **It is honest about what the screen is.** This is not a marketing surface; it
  is a liability statement. A ledger reads as serious and legible in a way a
  card-with-icon does not.
- **It stays inside the brand.** The partner workspace already speaks in deep
  operational teal (`apps/mobile-partners/src/design/tokens.ts`: `teal900
  #0B3B36`, `teal700 #0F766E`) with warm amber for "needs attention"
  (`amber700 #B45309`). The Cash Book keeps the teal chrome exactly as shipped
  and adds the "ruled paper" layer only *inside* content cards, so the redesign
  does not fight the existing navigation or hero.
- **It is the natural sibling of the two shipped proposals.** Order tracking
  chose "Waybill — a parcel manifest on warm paper"; checkout chose a market
  ledger. Cash Book is the same family of metaphor (printed operational
  documents) applied to the one surface that is literally a book of entries.
  A reviewer sees a coherent design language emerging across the app rather than
  three unrelated restyles.
- **It solves P1–P3 structurally, not cosmetically.** A ledger's whole point is
  that every number sits in a ruled column with a legible label and a signed
  balance. Moving from floating cards to ruled rows is what lets the labels grow
  from 9px to 12px without the layout falling apart.

**Distinctive choices (deliberate, not template).**

- A **monospaced figure face** for money, so digits align in a column and a
  rider can compare amounts vertically. Labels get a proportional face.
- **Status as stamps, not badges**: square-cornered, letter-spaced, upper-case
  stamps that read as ink on paper, tinted per state.
- **A signed ledger balance**: variance is rendered as a signed figure with an
  explicit `+`/`−` and a plain-language clause ("you are ₹X short" / "you are ₹X
  over" / "balanced").
- **A ruled baseline** under each entry, so the eye tracks across the row.

---

## 4. Before / after mapping

| # | Problem (evidence) | Change | Expected effect |
|---|--------------------|--------|-----------------|
| P1 | 9–10px labels (`198,201-208`) | Labels move to **12px** (`--label`), meta to **12px/16**, money to a **19–26px monospaced figure**, row titles to 13px. All sizes come from named type tokens. | Every label clears a comfortable legibility floor; the number-to-label relationship is unambiguous. |
| P2 | `#A7F3D0` on `#0F766E` = **4.27:1** (`198`,`201`) | Header label switches to `#D7F7EE` (**≈5.6:1** on `#0F766E`) and is 11px/700 instead of 9px. Hero card becomes a light "ruled" panel instead of a dark one, so its label uses `--ink-soft` (**7.5:1** on paper). | The two strings that name the screen and the amount clear AA at every point of the gradient. |
| P3 | Unsigned "Variance" (`26-31`,`93`,`139`) | A dedicated **signed variance line** with an explicit `+`/`−`, a plain-language clause, and a matching icon; the summary tile is relabelled "Net variance" and shows the sign. | A rider can tell balanced from short from over without decoding colour, and knows whether to act. |
| P4 | Error has no retry button (`113-114`) | Error state gains a **44pt "Try again" button** wired to `refetch`, plus a secondary "Contact support". | One obvious recovery action; no reliance on an undiscoverable gesture. |
| P5 | Raw error message shown (`114`) | Error copy is **fixed plain language**; the raw message is dropped from the UI (kept only in logs). | No developer text or internals in a money surface. |
| P6 | No offline handling (`NetInfo` absent) | An **offline banner** state is added to the mockup (and, at build time, would read connectivity); a stale-data marker sits next to the held-cash figure. | The rider is told the figure may be stale before they hand over cash. |
| P7 | Chips `minHeight: 38` (`203`) | Chips and all buttons move to **44pt minimum** (`--tap`). | Meets the platform touch-target floor on the primary navigation. |
| P8 | Enum-derived chip labels (`33-35`,`41`,`53-59`,`97`) | Chips are relabelled in rider language: **All · With me · Partly deposited · Settled · In dispute**, each with a live count, and "In dispute" carries a dot when non-zero. | The filter matches the question the rider is asking; no enum translation. |
| P9 | Bare spinner + false `₹0.00` hero while loading (`51`,`85`,`111-112`) | The hero and tiles render as **skeleton bars, never as `₹0.00`**, until real data arrives; the list shows **skeleton ruled rows** in the final layout. | No false balance is ever shown, and the page does not jump when data lands. |
| P10 | Empty state assumes a filter (`115-116`) | Two distinct empty states: **"No cash entries yet"** (genuinely empty ledger, with what to expect) and **"Nothing in <filter>"** (with a "Show all" action). | A new rider is not told their empty account is a filter mistake. |
| P11 | `warning` prop renders `danger`; duplicated colour (`93`,`139`,`207`) | One **`varianceTone`** helper with three explicit tones (balanced / short / over) and one pair of tokens per tone. | The same value reads the same everywhere, and the naming matches the meaning. |
| P12 | Policy paragraph below the buttons (`173`) | The action note is **moved above** the action row and rewritten as two short lines; the actions become the primary controls for a `needsAction` entry. | The instruction arrives before the controls that act on it. |
| P13 | No path to deposit; no reference to copy (`86`,`137`,`173`) | A **"Deposit cash"** action appears on any entry with a holding balance, next to a one-tap **copyable settlement reference**, plus a screen-level "Hand over cash" affordance when `cashHeldPaise > 0`. | The rider's one obligation becomes a button, not a sentence. |

---

## 5. What I would need to verify before shipping this

1. **Real-device text rendering at 12px.** I sized labels from tokens and
   measured contrast headlessly, but I could not render the RN app on a device
   (no KVM in this sandbox, per `AGENTS.md`). 12px must be confirmed comfortable
   on a 360dp Android screen in daylight, and `adjustsFontSizeToFit` /
   `allowFontScaling` behaviour checked against the largest OS font setting.
2. **Contrast of the composed gradients.** The header uses a three-stop gradient
   (`GradientSurface.tsx:14`, `#0B3B36 → #0F766E → #12897F`). I computed
   `#D7F7EE` against the mid stop `#0F766E`; I have **not** measured it against
   the lightest stop `#12897F`, where it will be lowest. This needs a real
   screenshot sample before the token is final.
3. **Screen-reader traversal order.** The redesign groups each entry as a
   labelled region; I could not run VoiceOver/TalkBack to confirm the reading
   order and that the signed variance is announced as "minus two hundred fifty
   rupees short", not as a bare number.
4. **The offline banner's real trigger.** `@react-native-community/netinfo` is
   not a dependency today (P6). Adding it is an application change outside this
   mockup's scope, so the banner is drawn from a state flag in the mockup only.
   Someone must confirm which connectivity signal the app will standardise on
   (there is a precedent in `RiderRunConsole.tsx:68-74`).
5. **Whether "Deposit cash" is a real route.** The mockup assumes the deposit
   flow is reachable from the ledger. `RiderRunDetailScreen.tsx:311,326` shows
   the app *can* create and submit a cash batch, so the action is plausible, but
   I have **not** verified that a ledger entry maps to a submittable batch, nor
   which of the two routes (`RiderRunDetailScreen` vs a new screen) should own
   it. This must be settled before the action ships, or it becomes a dead button.
6. **Reduced-motion.** The mockup uses no motion beyond a focus ring and a
   `prefers-reduced-motion` guard; the RN implementation should use
   `AccessibilityInfo.isReduceMotionEnabled` for any skeleton shimmer.
7. **Focus-visible in the web preview.** The mockup's keyboard focus styling is
   CSS. The RN app has no keyboard focus concept, so the equivalent requirement
   is only meaningful in the `mobile-web-preview` harness
   (`AGENTS.md`, "Browser preview of the mobile apps").

---

## 6. Token changes against `packages/mobile-shared/src/constants/theme.ts`

The shared theme is the customer app's token source; the partner workspace reads
`apps/mobile-partners/src/design/tokens.ts`. The proposal **adds** to both rather
than replacing, and every added value was chosen to satisfy AA (§7).

### `packages/mobile-shared/src/constants/theme.ts`

Add a small "ledger" group (values only; no existing token changes):

```ts
// Cash-ledger surface tokens. Added for the rider COD ledger redesign.
// Every pair below is AA-checked against its background (see the proposal §7).
export const LEDGER = {
  paper: '#FBFAF7',        // ruled content background, replaces #FFFFFF cards
  paperRule: '#E6E1D6',    // the ruled baseline under each entry
  ink: '#0B1F1B',          // 16.4:1 on paper — primary figure text
  inkSoft: '#3F5751',      // 7.5:1 on paper — labels and body
  inkMuted: '#5B6B77',     // 5.3:1 on paper — meta (was #94A3B8 at 2.45:1)
  varianceShort: '#9A3412',// 7.0:1 on paper — rider is short
  varianceOver: '#7A4A06', // 7.2:1 on paper — rider is over
  varianceBalanced: '#0B4F4A', // 8.1:1 on its wash — balanced
  stampSettledFg: '#0B4F4A', stampSettledBg: '#E3F1E9',
  stampHeldFg: '#3F5751',    stampHeldBg: '#EDEAE3',
  stampPartialFg: '#7A4A06', stampPartialBg: '#FDF3E3',
  stampDisputeFg: '#9A3412', stampDisputeBg: '#FBECEC',
} as const;

// Header label that clears AA on the partner teal chrome.
// #A7F3D0 on #0F766E is 4.27:1; #D7F7EE on #0F766E is ~5.6:1.
export const ON_TEAL_LABEL = '#D7F7EE';
```

### `apps/mobile-partners/src/design/tokens.ts`

- Add `onTeal: '#D7F7EE'` to `palette` (used for the header eyebrow and any
  label placed directly on the teal chrome).
- Add a `figure` entry to `typography` for monospaced money:
  ```ts
  figure: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.3 },
  figureLarge: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.6 },
  ```
- Raise the existing `label` token from `11` to `12` and `caption` from `10` to
  `12` (P1). This is a visible change to every partner screen that reads them, so
  it should ship behind a deliberate review of those screens, not silently.
- Add `tap: 44` to `spacing` (or a new `touch` group) so 44pt is a named value
  rather than a literal repeated in each file (P7).

### `RiderCodScreen.tsx` (illustrative only — **not** applied in this PR)

The shipped screen keeps its hardcoded hex values; the proposal would have it
read the tokens above. Two literal swaps carry the contrast fix directly:

- `eyebrow: { color: '#A7F3D0' … }` (`198`) → `color: palette.onTeal`
- `heroLabel: { color: '#A7F3D0' … }` (`201`) → `color: LEDGER.inkSoft` (the
  hero card becomes a light ruled panel in the redesign)

---

## 7. Contrast arithmetic (WCAG 2.1 relative luminance)

Formula: `L = 0.2126R + 0.7152G + 0.0722B` with
`c = c/12.92 if c ≤ 0.03928 else ((c+0.055)/1.055)^2.4`, then
`ratio = (Lmax+0.05)/(Lmin+0.05)`.

**Current screen — failing pairs**

| Pair | Ratio | Verdict |
|------|-------|---------|
| `#A7F3D0` on `#0F766E` (eyebrow `198`, heroLabel `201`) | **4.27:1** | fails AA for normal text |
| `#94A3B8` on `#F8FAFC` (empty-state icon `116`) | **2.45:1** | fails AA (icon, non-text) |
| `#64748B` on `#F8FAFC` (amountLabel `206`) | 4.55:1 | passes, but only just |
| `#64748B` on `#FFFFFF` (summaryLabel `202`, factLabel `207`) | 4.76:1 | passes, but only just |

**Proposed tokens — all pairs used by the redesign**

| Pair | Ratio | Verdict |
|------|-------|---------|
| `#0B1F1B` on `#FBFAF7` (figures) | 16.41:1 | pass AAA |
| `#3F5751` on `#FBFAF7` (labels) | 7.47:1 | pass AAA |
| `#5B6B77` on `#FBFAF7` (meta) | 5.27:1 | pass AA |
| `#5B6B77` on `#FFFFFF` | 5.51:1 | pass AA |
| `#9A3412` on `#FBFAF7` (short) | 7.00:1 | pass AAA |
| `#7A4A06` on `#FBFAF7` (over) | 7.16:1 | pass AAA |
| `#0F766E` on `#FBFAF7` (links) | 5.24:1 | pass AA |
| `#7A4A06` on `#FDF3E3` (partial stamp) | 6.80:1 | pass AAA |
| `#9A3412` on `#FBECEC` (dispute stamp) | 6.37:1 | pass AA |
| `#0B4F4A` on `#E3F1E9` (settled stamp) | 8.08:1 | pass AAA |
| `#3F5751` on `#EDEAE3` (held stamp) | 6.49:1 | pass AA |
| `#D7F7EE` on `#0F766E` (on-teal label) | ~5.6:1 | pass AA |

> **Caveat (also in §5.2):** the on-teal ratio is computed against the *mid*
> gradient stop. Against the lightest stop `#12897F` the same colour will fall,
> and that needs a screenshot measurement before the token is frozen.

---

## 8. The mockup

`mockup.html` is one self-contained static file (inline CSS, one Google Fonts
link, no other dependencies). It renders the **current** screen and the
**redesign** side by side at 360px phone width, and shows the redesign's four
states — **default, loading, empty, error** — plus the **offline** variant, on a
light and a dark page. Every value quoted in this document is annotated on the
mockup with a `P#` marker so a reviewer can match claim to pixel.
