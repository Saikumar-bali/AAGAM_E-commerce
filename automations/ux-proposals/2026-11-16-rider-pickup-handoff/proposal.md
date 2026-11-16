# UX proposal — Rider store-handoff / pickup verification

**Date:** 2026-11-16
**Screen:** `apps/mobile-partners/src/screens/rider/RiderPickupOperationsScreen.tsx` (350 lines)
**Role:** RIDER (mobile-partners)
**Mockup:** [`mockup.html`](./mockup.html) — self-contained, no build step

---

## 1 · Which screen, and why this one

This is the **rider's store-handoff screen**: the rider counts what the store
physically puts in their bag, verifies the exact quantities, then proves the
handoff with a six-digit store PIN or an expiring QR before the app unlocks
navigation to the customer.

**Why it, and not something already proposed.** Rotation was checked against the
six prior `ux-proposals/*` branches and the open draft PRs:

| Prior proposal | Screen |
| --- | --- |
| `2026-09-21-subscription-detail` | customer subscription detail |
| `2026-09-28-rider-run-detail` | rider run detail |
| `2026-10-05-milk-delivery-grid` | store milk grid |
| `2026-10-12-checkout` | customer checkout |
| `2026-10-26-order-tracking` | customer order tracking |
| `2026-11-09-rider-cod-ledger` | rider COD ledger |

Store handoff is a different surface from all six, and it is high-traffic: it is
the mandatory gate on **every** rider-delivered subscription day and every
delivered store order — the rider cannot reach the customer without clearing it.
It is also a genuine *audit* screen, so correctness-of-reading matters as much as
looks: a rider who mis-counts here causes a wrong delivery and a support ticket.

Two things make it worth a redesign rather than a restyle:

1. It has **two sequential jobs on one long scroll** (count → hand off) with no
   step model, so the rider has to infer where they are.
2. Its **primary action is not on screen** on a common device, and its
   **loading / empty / error states are the same picture**, so a network blip
   reads as "no work today".

The screen already has real strengths I did **not** discard: it labels its
icon-only controls for screen readers, it keeps persistent field labels, it
avoids placeholder-only inputs, and it is keyboard-aware
(`KeyboardAvoidingView` + `keyboardShouldPersistTaps`, lines 254–261). The
redesign keeps all of that.

---

## 2 · Diagnosis, with evidence

Every problem below cites the shipped line. Contrast ratios were computed from
the hex values in the file with the WCAG 2.1 relative-luminance formula; the
gradient stop used for the "on hero" rows is the *lightest* stop of the `teal`
preset, `#12897F` (`GradientSurface.tsx:14`), because that is the worst case.

### P1 — Tap targets below 44pt

| Control | Size | Line |
| --- | --- | --- |
| Back button | `width: 40, height: 40` | `RiderPickupOperationsScreen.tsx:338` |
| Quantity − / + steppers | `width: 38, height: 38` | `:343` |
| Problem-type chips | `minHeight: 36` | `:347` |
| Attached-evidence rows | `minHeight: 40` | `:348` |

Four distinct controls are under the 44pt minimum, and the steppers are the
**most-used control on the screen** (pressed once per unit counted). The screen
elsewhere proves the team already knows the rule — `refreshButton` is 44×44
(`:338`) and `evidenceButton` is `minHeight: 44` (`:348`) — so these four are
oversights, not a house style.

### P2 — Hero text fails AA contrast

| Text | Foreground | Background | Ratio | Line |
| --- | --- | --- | --- | --- |
| Subtitle ("Count every unit…") | `#CBD5E1` | `#12897F` | **2.88:1** | `:338` |
| Eyebrow ("RIDER PICKUP") | `#A7F3D0` | `#12897F` | **3.33:1** | `:338` |

Both are small text (11px and 9px) so they need **4.5:1**. They sit on a
*direction-dependent* gradient (`GradientSurface.tsx:13–20`), so the ratio
varies across the hero and is worst where the light stop lands. This is the one
place the palette is genuinely broken; the neutral scale is fine
(`#64748B` on white = 4.76:1, on `#F8FAFC` = 4.55:1 — both pass).

### P3 — Body copy set at 9–10px

Nine style rules set text at 9px or 10px: `eyebrow: 9` (`:338`),
`summaryText: 10` (`:339`), `sectionText: 10` (`:340`), `fieldHelp: 9` and
`inputProgress: 9` (`:342`), `itemMeta: 10` (`:343`), `problemChipText: 9` and
`problemText: 10` (`:347`), `fileName: 10` (`:348`). On a 360pt-wide device that
is below the comfortable floor for guidance text a rider reads *while holding a
bag*, and `fieldHelp` — the sentence that explains what the PIN is — is the
smallest text on the screen at 9px.

### P4 — No step model; the rider has to infer the sequence

The screen is two steps — verify quantities, then verify the store handoff — but
nothing names them. The handoff card is rendered **conditionally** on
`checklistVerified` (`:231`, `:290`), so a rider at step 1 sees no hint that a
second step exists, and a rider at step 2 sees the checklist card disappear. The
only progress signal is a badge printing a raw fraction
`` `${totalReceived}/${totalExpected}` `` (`:287`), which is a quantity, not a
position in a flow.

### P5 — The primary action is below the fold on a common device

The verify button is the last child of the checklist card (`:310`), after the
section header, every item row and the parcel-code input (`:293–309`). Each item
row is `minHeight: 72` + `marginTop: 10` (`:343`) ⇒ **82pt per line**:

```
hero                ~ 90   (paddingTop 24 + content + paddingBottom, :338)
summary card        ~104   (margin 14 + padding 16 + 3 text rows, :339)
checklist header    ~ 46   (:340)
4 item rows         ~328   (4 × 82, :343)
parcel-code input   ~ 60   (minHeight 50 + marginTop 10, :344)
verify button       ~ 60   (minHeight 50 + marginTop 10, :345)
                    -----
                    ~688pt  before the button is reachable
```

A 360×640 logical device has roughly 590pt of usable height under status bar and
home indicator, so with four lines the button is ~100pt below the fold; with six
lines it is ~260pt below. This is an estimate from the declared style heights —
I could not measure it on a device headlessly, and it is itemised in §5.

### P6 — The tie-out total lives inside a badge, not in a fixed place

`summaryText` (`:286`) and the badge (`:287`) are the only place the running
totals appear, and they scroll away with the summary card. The rider's actual
task is to *tie out* — expected vs received — but the number that answers "am I
done counting?" is never visible while counting the last rows.

### P7 — Empty and error render as the same picture, and error has no retry

Both states use one `State` component (`:332–334`) that shows a grey
`PackageCheck` icon and a title/body. The only difference is the text:

- error → `<State title="Pickup task unavailable" text={errorMessage(...)} />` (`:280`)
- empty → `<State title="No pickup waiting" text="…checking whether the store already confirmed handoff." />` (`:282`)

Neither offers a control. Recovery is a pull-to-refresh the rider has to guess
(`RefreshControl`, `:261`). The query sets `retry: 1` (`:95`), so a single
transient failure lands the rider permanently on the error screen until they
find the gesture.

### P8 — No offline / stale handling anywhere in the app

`NetInfo` is not imported in `apps/mobile-partners/src` at all
(`grep -rln NetInfo apps/mobile-partners/src` → no files). With a 5s poll
(`:94`) and `retry: 1` (`:95`), losing signal mid-count leaves the last-fetched
quantities on screen with no indication they may be stale, and the mutation
fails into a toast (`:155`, `:174`, `:192`, `:216`) that vanishes. A rider
underground or in a lift gets no persistent "you are offline" state.

### P9 — Loading is a bare spinner, and the layout jumps

`State loading` renders one centred `ActivityIndicator` inside a `minHeight: 480`
box (`:333`, `:349`). When data arrives, the whole screen is replaced by a
different layout, so the content jumps. There is no skeleton that preserves the
final shape.

### P10 — The mismatch path is buried behind a 36pt target

"Report a problem" is a collapsed card whose header toggles on press
(`:314`) with `problemHeader: minHeight 72` — the *row* is tall but the thing
that looks pressable is the small `problemLink` text, and the chips inside are
`minHeight: 36` (`:347`). The most consequential action on the screen (the parcel
is wrong — do not take it) is the least prominent.

### Checked and *not* claimed

- **Unlabelled icon-only buttons** — not a defect here. Back (`:269`), refresh
  (`:274`), steppers (`:302`, `:304`) and evidence remove (`:320`) all carry
  `accessibilityLabel`. The redesign preserves this.
- **Placeholder-only inputs** — not a defect. PIN (`:241`) and problem note
  (`:318`) both have persistent labels.
- **PIN digits left visible** — deliberate and documented at `:243`. Kept as a
  considered trade-off, not treated as a bug (see §5).

---

## 3 · Aesthetic direction — "Ops Manifest"

**The idea:** this screen is a hand-off *document*. A store gives a rider goods
against a count, and the count has to tie out before the rider signs for it. So
the redesign is built like the paperwork that exchange actually is — **a ruled
manifest with counted rows, a running tie-out total, and a signature line (the
PIN)** — rather than a stack of cards.

**Why it fits this product.** The brand chrome is a deep operational teal
(`theme.ts` `primary #0F766E`; `design/tokens.ts` `teal900 #0B3B36`). The
manifest keeps teal as the *chrome and trust* colour and changes what the
working surface is made of: warm paper, hairline rules, and tabular monospaced
figures. That is a real information-architecture change, not a re-skin:

- **Chrome goes flat ink, not gradient.** The gradient is what breaks contrast
  (P2); a flat `#08322E` plate fixes it and reads as a sturdier, more industrial
  header for a work tool.
- **Figures become monospaced and tabular**, because the rider is comparing two
  columns of integers and a proportional font makes that harder.
- **Rows become ruled, not carded.** Rules let more lines fit above the fold
  (P5) and make the count scannable like a ledger.
- **The tie-out total becomes a sticky bar** (P6) — the single number that
  answers "am I done?" is pinned.
- **The primary action becomes a sticky footer** (P5), so it is never below the
  fold regardless of line count.

**What it deliberately is not.** Not a pastel "calm" mobile look, not a
gradient-and-glow restyle, and not the current design with rounder corners. It
takes the document metaphor seriously: rules, columns, totals, and one accent
for "this line is wrong".

**Accessibility is structural, not decorative.** Every tap target is ≥48pt, every
text pair is AA or better (§4), the two steps are real `role="list"` progress
with text labels so a screen reader announces "step 1 of 2", the steppers are
labelled buttons with live `aria-live` totals, the sticky footer is a real
`<button>` reachable in DOM order, and `prefers-reduced-motion` disables the
skeleton shimmer.

---

## 4 · Before → after mapping

| # | Problem (evidence) | Change | Expected effect |
| --- | --- | --- | --- |
| P1 | Steppers 38×38, back 40×40, chips 36, file rows 40 (`:338`, `:343`, `:347`, `:348`) | Every interactive control ≥48×48; steppers become 48×48, chips 48 tall, evidence rows 56 tall, back 48×48 | Meets the 44pt minimum with margin; fewer mis-taps while holding a bag |
| P2 | Hero subtitle 2.88:1, eyebrow 3.33:1 (`:338`) | Flat `#08322E` chrome plate; `#E6F5F1` (12.41:1) and `#B9D8D2` (9.17:1) text | AA/AAA on the hero at every width — no gradient-dependent worst case |
| P3 | Nine rules at 9–10px (`:338`–`:348`) | Body 13px, labels 12px, help 12px; eyebrow 11px uppercase; figures 16px mono | Readable at arm's length; help text no longer the smallest thing on screen |
| P4 | Two steps on one scroll, gated by `checklistVerified`, no labels (`:231`, `:287`, `:290`) | Numbered step rail "1 · Count the parcel" / "2 · Sign the hand-off", as a labelled list with the active step marked | The rider always knows the sequence and where they are |
| P5 | Verify button last in the card, ~688pt down (`:310`) | Primary action moves to a **sticky footer**, always on screen; the in-card button is removed | Primary action never below the fold, at any line count |
| P6 | Totals only in the scrolling summary badge (`:286`, `:287`) | Sticky **tie-out bar**: "Counted 12 of 12 · Tied out", with a short/over chip | The number that answers "am I done?" stays visible while counting |
| P7 | Empty and error share one picture, no action (`:280`, `:282`, `:332–334`) | Distinct empty (illustration + "Check again") and error (rose strip + "Try again" + "Copy reference") states, each with a real button | Recovery is one tap, not a guessed gesture; the two causes are distinguishable |
| P8 | No `NetInfo`; 5s poll + `retry: 1`; vanishing toasts (`:94`, `:95`, `:155`) | Persistent amber offline bar with a last-synced time; stale data visibly marked; the CTA disables with a stated reason | A signal drop is legible and the rider is told why the button is inert |
| P9 | Bare centred spinner in a 480pt box (`:333`, `:349`) | Manifest-shaped skeleton: header, tie-out bar and ruled rows at their final size | No layout jump when data lands; the shape previews the task |
| P10 | Mismatch buried behind a 36pt chip row and a collapsed header (`:314`, `:347`) | Full-width 56pt "Something is wrong with this parcel" row that opens the evidence tray directly | The safety-critical path is as easy to hit as the happy path |

---

## 5 · What I would need to verify before shipping this

Honest list. Nothing here was measured on a device or with a screen reader —
this is a static mockup, so these are the checks the mockup *cannot* answer:

1. **Fold position on real hardware.** §2 P5 is arithmetic from the declared
   style heights. I would measure the y-offset of the CTA on a 360×640 device
   (and a 320pt small phone) with the layout inspector, at 2, 4 and 8 checklist
   lines, and confirm the sticky footer never covers the last row (it needs the
   scroll container to reserve footer height — `paddingBottom` on the content,
   not just `position: absolute`).
2. **Screen-reader traversal order.** Confirm TalkBack and VoiceOver announce
   the step rail as "step 1 of 2", read the tie-out bar only on change (via
   `aria-live="polite"` equivalent — `AccessibilityInfo.announceForAccessibility`
   in RN), and that the sticky footer is reachable without swiping back up. The
   DOM order in the mockup is the proposed order; RN needs a matching
   `accessibilityViewIsModal`/focus review.
3. **Contrast on the real gradient-free header at 1x rendering.** I computed
   ratios from hex values; I would confirm the shipped text colour and the
   `#08322E` plate with a contrast checker on a real screenshot, including
   Android's default font rendering (which thickens glyphs).
4. **Dynamic type / font scaling.** All sizes are still hardcoded `fontSize`
   (no `allowFontScaling={false}`), so a user at 200% text scale will reflow
   the ruled rows. I would test at 130% and 200% and let rows grow rather than
   clip.
5. **The PIN-visibility trade-off.** `:243` deliberately keeps the six digits
   visible so the rider can re-read them. I did **not** change that, because it
   is a documented choice and shoulder-surfing risk at a store counter is a
   product decision, not a styling one. It should be confirmed with the store
   team before any change.
6. **Offline detection actually firing.** `NetInfo` is not currently a
   dependency of the app. Adding it is a runtime change, so this proposal only
   specifies the *state*; wiring `@react-native-community/netinfo` needs a
   dependency review (and it must not be added in this mockup pass).
7. **Skeleton + reduced-motion on real RN.** `prefers-reduced-motion` is a web
   media query; on RN the equivalent is `AccessibilityInfo.isReduceMotionEnabled`
   (iOS) / `Settings.Global.TRANSITION_ANIMATION_SCALE` (Android). The mockup
   demonstrates the web behaviour; the RN implementation needs that API.
8. **Keyboard-only / focus-visible.** `:focus-visible` has no RN equivalent.
   The mockup shows it for the reviewer's benefit and for the web shop/admin
   siblings of this flow; the RN screen relies on `accessibilityState` instead.
9. **No regression in the shipped contract test.** `RiderPickupOperationsScreen.contract.spec.ts`
   asserts the literal strings `Store pickup PIN`, `{pickupPin.length}/6 digits`,
   `Problem details`, `{problemNote.length}/500`, `accessibilityLabel="Six-digit
   store pickup PIN"`, and that `{handoffCard}` precedes the checklist. The
   redesign keeps all of those labels and the ordering, but the assertions are
   string-level, so any implementation must re-run that spec.

---

## 6 · Token changes against `packages/mobile-shared/src/constants/theme.ts`

Additive only. No existing token is renamed or changed, so no shipped surface
moves. The neutrals (`textSecondary #64748B`, `border #E2E8F0`) already pass AA
and stay as they are; the new block exists because the manifest needs *pairs*
(foreground + wash) whose ratio is fixed by construction rather than eyeballed
per screen.

```ts
// packages/mobile-shared/src/constants/theme.ts — proposed addition
//
// "Ops Manifest": the working surface for audit screens (rider store handoff,
// pickup checklist). Every foreground/wash pair below is >= 6:1 so a row can
// carry its own state colour without a per-screen contrast decision.
export const OPS = {
  // chrome — flat ink replaces the hero gradient, which was the only
  // sub-4.5:1 text on the screen (subtitle 2.88:1 on the light teal stop)
  ink: '#08322E',
  onInk: '#E6F5F1',        // 12.41:1 on ink
  onInkMuted: '#B9D8D2',   //  9.17:1 on ink

  // paper layer
  manifest: '#FBFAF7',
  manifestRule: '#DCE7E3',
  manifestSink: '#F4F1E9',

  // one meaning, one pair
  matchFg: '#0B4F4A', matchWash: '#E3F1E9',      // 8.08:1
  shortFg: '#8A2E0B', shortWash: '#FBEAE4',      // 7.27:1  (received < expected)
  overFg:  '#6B4703', overWash:  '#FBF0DC',      // 7.36:1  (received > expected)
  pendingFg: '#3F5751', pendingWash: '#EDEAE3',  // 6.49:1  (not counted yet)

  // the manifest minimum: 48 beats the 44 floor so the 38pt steppers cannot
  // reappear on a dense screen
  tap: 48,
} as const;
```

Companion, in `apps/mobile-partners/src/design/tokens.ts`, the same values are
exposed as `palette.ink` / `palette.manifest` etc. so the rider and store
workspaces keep reading one source. `spacing`, `radius` and `typography` in that
file are unchanged, except `typography.metric` is joined by a
`typography.figure` (16px, mono, tabular) for the counted columns.

**Measured ratios for every pair** (WCAG 2.1, computed from these hex values):

| Pair | Ratio |
| --- | --- |
| `onInk #E6F5F1` on `ink #08322E` | 12.41:1 |
| `onInkMuted #B9D8D2` on `ink #08322E` | 9.17:1 |
| `matchFg #0B4F4A` on `matchWash #E3F1E9` | 8.08:1 |
| `shortFg #8A2E0B` on `shortWash #FBEAE4` | 7.27:1 |
| `overFg #6B4703` on `overWash #FBF0DC` | 7.36:1 |
| `pendingFg #3F5751` on `pendingWash #EDEAE3` | 6.49:1 |
| white on `primary #0F766E` (unchanged) | 5.47:1 |
| white on `shortFg #8A2E0B` (danger CTA) | 8.48:1 |

---

## 7 · The mockup

`mockup.html` is one self-contained file — inline CSS, no build, no
dependencies. It renders the shipped screen and the proposed screen side by side
in 360pt device frames, at 360px and at desktop width, with these variants:

| Variant | Before | After |
| --- | --- | --- |
| Default (mid-count, 4 lines) | shipped layout | Ops Manifest, step 1 |
| Loading | centred spinner | manifest skeleton |
| Empty (nothing handed off yet) | grey icon, no action | distinct empty + "Check again" |
| Error (retryable) | grey icon, same picture | rose strip + "Try again" / "Copy reference" |
| Offline (stale) | *(no such state)* | amber bar + stale marking + disabled CTA |

Each "after" panel is annotated with the problem key (P1…P10) so a reviewer can
map what they see back to §2.

---

_This proposal contains static HTML mockups only and changes no application code. It is generated by an AI agent (OpenHands) on behalf of Saikumar-bali and is intended as a design discussion starting point, not as mergeable code._
