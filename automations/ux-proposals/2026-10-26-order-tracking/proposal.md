# UX proposal: Order tracking (`OrderDetailScreen.tsx`) — 2026-10-26

## 1. Screen chosen

`apps/mobile-customer/src/screens/customer/OrderDetailScreen.tsx` — the customer
**order tracking / order detail** screen in `apps/mobile-customer`. This is the
screen a customer opens after checkout, from the "My Orders" list
(`OrdersScreen.tsx:124`) or from a push notification, to answer one question:
*where is my order right now, and what do I have to do about it?*

**Why this screen, and why now**

- Rotation check. The remote `ux-proposals/*` branches are
  `2026-09-…-subscription-detail`, `2026-09-28-rider-run-detail`,
  `2026-10-05-milk-delivery-grid` and `2026-10-12-checkout` (PR #485). Order
  tracking has **not** been proposed, and it is the next high-traffic,
  user-visible surface in the candidate list.
- It is the most anxious moment in the product: a live, time-sensitive wait.
  The screen is also the only customer surface that carries a live map, an
  ETA, a rider contact and a delivery verification code, so it concentrates
  the app's most important "is this working?" signals into one place.
- It has real, citable UX problems — not cosmetic drift. The most serious one
  is a **state-name bug that produces a permanently blank live-tracking panel**
  (P1 below); the rest are below-the-fold actions, sub-44pt tap targets,
  colour-only signalling, dead-end states and ambiguous money.

---

## 2. Diagnosis with evidence

All line numbers are `apps/mobile-customer/src/screens/customer/OrderDetailScreen.tsx`
unless stated otherwise. Contrast ratios were computed from the literal hex
values in the file with the WCAG relative-luminance formula; the working is in
§7.

| # | Problem | Evidence (file:line) | Why it hurts |
|---|---------|----------------------|--------------|
| **P1** | **The live-tracking panel never renders for a moving order — a state-name mismatch.** The panel is gated on `["LIVE", "STALE", "ASSIGNED_NO_LOCATION"]`, but the banner component's `switch` has **no `LIVE` case** and falls through to `default: return null`. A live order is therefore in a state the map panel accepts and the status banner silently drops. | gate `388`; `switch` cases `87`–`144`, `default` at `142`; state sourced at `207` (`tracking?.trackingState \|\| "NOT_ASSIGNED"`) | This is the screen's core failure. While the rider is moving — the only time the map matters — the customer gets **no status sentence above the map** and only a bare map. They cannot tell live from stale from "we lost the rider". |
| **P2** | **Primary action ("Review order") sits after ~6 cards.** It is rendered at `437`–`445`, after hero → scheduled-delivery → tracking banner → delivery-code → store-delivery → live map → **Timeline** → **Delivery Address** → **Items** → **Bill Summary** → **Payment** (`447`–`594`). Container padding is `paddingBottom: 150` (`601`). | `content` at `601`; button at `437`; cards at `447`–`594` | On a 360×640 dp device the "Review order" affordance is 3–4 screens down, so it is effectively invisible. Post-delivery reviews are lost. |
| **P3** | **The tap-to-call buttons are ~32pt tall, below the 44pt floor.** `callBtn` has `paddingVertical: 8` (`703`) plus a 12px text line (`705`) and no `minHeight`; there are two of them ("Call Store Partner" `379`–`383`, "Call Rider" `424`–`430`). | style `697`–`705`; used `379`, `426` | "Call the rider" is the one action a waiting customer reaches for, and it is the smallest target on the screen. |
| **P4** | **The rider's phone number is never shown — only an icon-sized button.** `trackingPayload.rider.phone` is used solely to build a `tel:` URL (`427`); the number is not rendered as text. The same is true for the store phone (`380`). | `423`–`431`; store `377`–`384` | A customer who wants to save the number, or whose dialer fails, has nothing to read. The call is the only affordance. |
| **P5** | **Two "Rider" labels on one screen.** The live map's `riderLabel` is `"Rider"` (`418`, styled `736`–`741`) and the tracking banner names the rider separately (`103`–`105`). Combined with the section title "Live Tracking" (`390`) the same person is introduced twice with different emphasis. | `390`, `415`–`421`, `103` | Redundant labelling wastes the single most valuable line — "who is coming" — and splits attention. |
| **P6** | **Secondary text fails 4.5:1.** `#94A3B8` on white is **2.56:1** and on the app background `#F8FAFC` is **2.45:1**. It is used for `trackingInfoLabel` (`716`–`720`, e.g. "ETA", "Distance", "Last Update") and `riderLabel` (`736`–`741`). | styles `715`–`741`; used `400`, `411`, `418` | The units and labels for the live ETA and distance — the numbers the customer is staring at — are the least readable text on the screen. |
| **P7** | **`#99F6E4` on the teal hero is 4.34:1, below the floor.** It is the `amountLabel` colour (`619`, used `337`). | `617`–`624`; used `337` | The word that tells the customer *what the number means* ("Cash due" / "Funded delivery") is the one string on the hero that misses AA. |
| **P8** | **Money is ambiguous: a bare ₹ amount with a `Cash due` / `Funded delivery` label and no sentence.** The hero prints `{amountSummary.label}` then `{formatOrderAmount(amountSummary.amountRupees)}` (`337`–`338`). For a funded subscription delivery the label is `Funded delivery` and the amount is `₹0` (`orderPresentation.ts:47`). | `337`–`338`; label logic `orderPresentation.ts:25`–`68` | "Funded delivery ₹0" is not a sentence a customer can act on. They cannot tell whether they must hand cash to the rider. |
| **P9** | **"Scheduled delivery" is shown on every order even after delivery, and the help copy is wrong for delivered orders.** The block renders whenever `deliveryWindow()` is non-null (`348`) regardless of `order.status`, and always says "Your store prepares this order within the scheduled delivery window" (`352`–`354`). | `348`–`356`; helper `28`–`48` | On a `DELIVERED` order the card still reads in the future tense. It contradicts the hero's own status text directly above it. |
| **P10** | **Payment status is printed as a raw enum.** `Method: {trackingPayload.payment?.method \|\| "N/A"}` and `Status: {trackingPayload.payment?.status \|\| "N/A"}` (`580`–`585`) render values such as `PENDING_COD`, `SUBSCRIPTION_FUNDED`, `CASH`. | `578`–`594` | Underscored SCREAMING_CASE is developer vocabulary in a customer surface, and `N/A` gives no next step. |
| **P11** | **Timestamps ignore the locale and timezone the file already knows about.** The hero uses `new Date(order.createdAt).toLocaleString()` (`336`) and each timeline row uses the same (`467`), while `deliveryWindow()` deliberately formats in `Asia/Kolkata` with `en-IN` (`32`–`47`). | `336`, `467` vs `32`–`47` | Order time and delivery window can disagree by a day near midnight, and the device locale leaks into an India-only product. |
| **P12** | **Timeline has no empty state and no truncation.** `{(trackingPayload.timeline \|\| []).map(...)}` (`449`) renders nothing at all when the array is empty, leaving a card titled "Timeline" (`448`) with an empty body. | `447`–`473` | A titled, empty card reads as a loading failure. |
| **P13** | **Error state is a dead end.** `Unable to load order details.` with no retry, no offline hint and no support link (`284`–`290`), even though the query exposes `refetch` (`160`). | `284`–`290`; `refetch` at `156`–`167` | The customer's only recovery is to kill the app. |
| **P14** | **Loading state is a bare spinner with no skeleton or label.** `<ActivityIndicator size="large" color="#0F766E" />` in a centred flex box (`277`–`283`). | `277`–`283` | On a slow connection the customer cannot tell whether the order loaded or the app hung. |
| **P15** | **No offline handling anywhere.** `@react-native-community/netinfo` is not imported in `apps/mobile-customer/src` and is not a dependency of `apps/mobile-customer/package.json` (verified by grep — zero matches). | absence of `NetInfo`; socket/poll wiring `169`–`203` | The screen polls every 10s (`199`) and subscribes to five socket events (`173`–`187`). Offline, the "Last Update" counter climbs forever (`267`–`275`) and nothing says the connection is down. |
| **P16** | **The delivery-verification code is an unstyled, unlabelled touch target inside the card.** The code itself renders at `fontSize: 34` (`153`) but the surrounding card is not grouped with the code's purpose, and the copy "Share it only after checking and receiving the parcel." (`99`) sits *above* the button that reveals the code (`128`). | `93`–`133`; styles `152`–`158` | The security instruction is separated from the action it governs, and the largest number on the screen has no label saying what it is. |

**Things the screen already does right (kept, not discarded).** A real loading
branch (`277`), a real error branch (`284`), socket-driven live updates with a
10s polling backstop (`169`–`203`), a `testID` on the rider call button
(`425`), locale-correct `en-IN`/`Asia/Kolkata` formatting in `deliveryWindow`
(`32`–`47`), an explicit "No location data" string (`268`), and the whole
`DeliveryCodeCard` component — including its expiry countdown (`53`–`64`), its
error message (`25`–`30`) and its 44pt+ buttons (`155`, `157`). The redesign
reuses all of this behaviour and changes only presentation.

---

## 3. Aesthetic direction

**"Waybill" — a parcel-tracking manifest, printed on warm paper.**

The reference is not a dashboard. It is the paper waybill stapled to a courier
package: a stack of status stamps down one edge, a route line, a
recipient block, a money line, and a signature at the end. That artefact is
*already* the mental model a customer holds when they open this screen, so the
redesign borrows its grammar instead of inventing one.

**Why it fits this product.** The existing tokens are teal-on-white
(`packages/mobile-shared/src/constants/theme.ts`: `primary: '#0F766E'`,
`background: '#F8FAFC'`, `border: '#E2E8F0'`), and the previous two proposals
for this repo — Checkout's "Market Ledger" and the subscription surfaces'
"paper + green ink" feel — both lean on the same printed-document metaphor. The
teal is the brand's ink; the redesign keeps it as ink and stops using it as a
full-bleed background.

**What changes, deliberately:**

1. **Warm paper instead of cool slate.** Background moves from `#F8FAFC`
   (blue-grey) to `#F6F4EF` (warm paper). Cards become true `#FFFFFF` sheets
   with a **1px hairline rule and a soft offset shadow**, not a flat 1px border
   — the sheet-on-paper look is what makes a manifest feel physical.
2. **A ruled left margin.** Every card carries a 3px `--rule` vertical line
   (a tinted teal) inset from the left edge, the way a ledger page is ruled.
   This is the one repeating decorative device; it does the work a column of
   identical rounded cards cannot.
3. **Status stamps, not badges.** The tracking state is rendered as an inline
   rubber-stamp block with a **double hairline border** and a small-caps,
   letter-spaced label. Stamps carry the state; the colour is a reinforcement,
   never the message.
4. **Editorial type pairing.** Body and UI text in **Archivo** (a grotesque
   with slightly squared terminals — reads as printed, not as a screen);
   numbers, the order id, the delivery code, the ETA and the amount in
   **Martian Mono** at a heavy weight, because a manifest is full of figures
   that must align. Both are single embeddable families with a
   `font-display: swap` system fallback, and both are deliberately *not* the
   current system-font/`Inter` default.
5. **The ETA is the headline.** The single largest element on the screen is the
   arrival estimate in mono, with the status stamp beside it. The customer
   opened this screen for one number.
6. **Reduced motion respected.** The only motion is a one-shot staggered
   reveal on mount and a 2s pulse on the "live" dot; both are inside
   `@media (prefers-reduced-motion: no-preference)`, so the reduced-motion
   default is a fully static screen.

---

## 4. Before / after mapping

| # | Problem (evidence) | Change in the redesign | Expected effect |
|---|--------------------|------------------------|-----------------|
| P1 | Live panel gated on `LIVE` (`388`) but banner `switch` has no `LIVE` case (`87`–`144`) | **One** status vocabulary: the redesign defines the six states `NOT_ASSIGNED`, `ASSIGNED`, `LIVE`, `STALE`, `DELIVERED`, `CANCELLED` and renders the stamp **and** the map panel from the same lookup, so a state can never be accepted by one and dropped by the other | The moving-rider state now has a status sentence. The class of bug is removed, not patched. |
| P2 | "Review order" at `437`, 6+ cards down | Primary action promoted into a **sticky action bar** pinned to the bottom of the viewport, visible without scrolling | Review becomes reachable in every state where it applies. |
| P3 | `callBtn` ~32pt (`703`) | Every interactive control gets `min-height: 48px` / `min-width: 48px`; the call buttons become full-width 48px rows | Meets Apple HIG / Material 44pt. |
| P4 | Phone shown only as a `tel:` target (`427`) | The number is **printed as text** next to the call button, in mono, with the rider's name | The customer can read and save the number. |
| P5 | "Rider" labelled twice (`418`, `103`) | A single **rider block**: name, vehicle, number and the call action grouped once | One introduction, one place to look. |
| P6 | `#94A3B8` = 2.56:1 (`716`, `736`) | Muted text token raised to `#5C6B68` → **5.08:1** on paper, **5.59:1** on white | ETA/distance/last-update labels become readable. |
| P7 | `#99F6E4` on teal = 4.34:1 (`619`) | Hero is re-cut: ink on paper, so the label uses `--ink-soft` (`#43524F`, 7.47:1) and the amount uses `--ink` (16.05:1) | Passes AA with headroom. |
| P8 | "Funded delivery ₹0" (`337`–`338`, `orderPresentation.ts:47`) | The amount is rendered as a **sentence**: "Nothing to pay — this delivery is funded by your plan." vs "Have ₹130 ready in cash." The figure is secondary to the sentence | The customer knows whether to have cash ready. |
| P9 | Future-tense schedule copy on delivered orders (`348`–`354`) | Schedule card copy is **status-aware**: future tense while pending, past tense ("Delivered on …") once terminal; hidden for cancelled | Copy stops contradicting the status. |
| P10 | Raw `PENDING_COD` / `N/A` (`580`–`585`) | Enum → human label map (`PENDING_COD` → "Cash on delivery", `SUBSCRIPTION_FUNDED` → "Paid by plan", `CAPTURED` → "Paid") | Customer vocabulary instead of developer vocabulary. |
| P11 | `toLocaleString()` at `336`, `467` | All timestamps go through one `en-IN` / `Asia/Kolkata` formatter, matching `deliveryWindow` (`32`–`47`) | Order time and window can no longer disagree. |
| P12 | Empty timeline renders an empty card (`449`) | Timeline gets a real **empty state** ("No updates yet — the first scan will appear here") | No more card that looks broken. |
| P13 | Dead-end error (`284`–`290`) | Error state gains **Try again** (wired to the existing `refetch`), an offline explanation and a support link | A recoverable path replaces an app restart. |
| P14 | Bare spinner (`277`–`283`) | Skeleton that mirrors the real layout plus a "Loading your order…" label | Perceived performance improves; the app looks alive. |
| P15 | No `NetInfo` anywhere | A **connection ribbon** appears in the header when the socket is down and the last ping is stale, with the age of the last successful update | "Last Update 42m ago" stops being unexplained. |
| P16 | Code card copy above the reveal button (`99` vs `128`) | Instruction moves **under** the reveal control and directly above the code panel; the code panel gains a "Delivery verification code" label | The security instruction sits with the action it governs. |

---

## 5. What I would need to verify before shipping this

This is a mockup pass and I could not run any of the following headlessly.
Each one is a real gate, not a formality.

1. **The `LIVE` state actually exists in the API.** The redesign assumes the
   gateway can emit `trackingState: 'LIVE'`. I inferred it from the panel's own
   allow-list (`OrderDetailScreen.tsx:388`) but did not run the gateway. Before
   shipping, grep `apps/api-gateway/src/tracking/` for the emitted state
   strings and confirm the full set, then make the redesign's state map
   exhaustive against it. If `LIVE` is *not* emitted, P1 is a different bug
   (dead gate) with the same fix.
2. **Contrast on the real device.** I computed ratios from hex values (see §7).
   I could not run a contrast checker against a rendered screen, and the warm
   paper `#F6F4EF` interacts with RN's own alpha compositing. Re-measure with
   the shipped values on device.
3. **Screen-reader traversal.** The mockup marks up roles and labels in HTML,
   but React Native reads `accessibilityLabel` / `accessibilityRole` /
   `accessibilityState`, not DOM semantics. Every control in the redesign needs
   an explicit `accessibilityRole="button"` plus a label, and the sticky action
   bar needs `accessibilityViewIsModal` reasoning so it does not trap focus.
   Run VoiceOver (iOS) and TalkBack (Android) through the delivered, empty and
   error states.
4. **Focus order and `focus-visible`.** The mockup's `:focus-visible` ring is
   CSS. On native, focus is driven by the TV/`focusable` props and by the
   screen reader, so the visual ring must be re-implemented (e.g. an
   `onFocus`/`onBlur` border state) and verified with a keyboard on a
   hardware-keyboard device.
5. **Dynamic type.** The redesign uses fixed `px`. The current screen inherits
   RN's font scaling. I could not test at 200% text size; the ETA headline and
   the sticky bar are the two places most likely to overflow.
6. **Real data shapes.** The mockup uses representative values. The rider
   block, the payment label map and the timeline must be checked against a real
   `GET /tracking/my/order/:id` payload for a live, a delivered and a cancelled
   order, including an order with no `addressSnapshot`.
7. **The 10s poll + socket cost.** The redesign does not change data flow, but
   the connection ribbon depends on distinguishing "socket down" from "rider
   idle". That needs a real dropped-connection test, which I cannot do
   headlessly.
8. **The `DeliveryCodeCard` is unchanged.** I left it alone because it is
   already accessible (44pt+ targets, a real error message, an expiry
   countdown). If the Waybill restyle is applied, re-verify its contrast on
   warm paper.

---

## 6. Token changes against `packages/mobile-shared/src/constants/theme.ts`

The redesign is additive. It keeps every existing token name and value, and
proposes the following **additions** (no renames, so no screen breaks).

### 6.1 New colour tokens

```ts
export const COLORS = {
  // ...existing tokens unchanged...

  // "Waybill" surface layer. The app background moves from the cool
  // #F8FAFC slate to warm paper so the white cards read as sheets.
  paper: '#F6F4EF',          // app background (replaces #F8FAFC usage on this screen)
  paperRule: '#DAD5C9',      // hairline rules between cards
  rule: '#0F766E',           // the 3px ruled left margin on each card

  // Text ramp, measured on #F6F4EF (paper) and #FFFFFF (surface).
  ink: '#0E1B1A',            // 16.05:1 paper / 17.64:1 surface  (was #0F172A)
  inkSoft: '#43524F',        //  7.47:1 paper /  7.93:1 surface  (was #475569)
  inkMuted: '#5C6B68',       //  5.08:1 paper /  5.59:1 surface  (was #94A3B8 — 2.56:1)

  // Status inks, all ≥ 4.5:1 on their own wash.
  stampLive: '#0B4F4A',      //  8.24:1 on tealWash
  tealWash: '#E4F3F0',
  stampWait: '#43524F',      //  7.18:1 on tealWash
  stampAmber: '#8A3A0B',     //  7.10:1 on amberWash
  amberWash: '#FDF3E3',
  stampDanger: '#9A1B1B',    //  7.19:1 on dangerWash
  dangerWash: '#FBECEC',

  // Money.
  money: '#0B4F4A',          // 8.56:1 on paper — the amount figure
  cashWash: '#FDF3E3',
  cashInk: '#7A4A06',        //  6.80:1 on paper — "cash is due"
};
```

**Deliberately unchanged:** `primary` (`#0F766E`), `primaryLight`, `primaryDark`,
`brandGreen`, `accent`, `surface`, `error`, `success`, `warning`, `white`,
`dark`, `darkCard`. The brand teal is not being replaced — it is being
demoted from "background" to "ink", which is the whole point of the direction.

### 6.2 New spacing and radius tokens

```ts
export const SPACING = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
  // additions
  xxs: 2,
  rule: 3,      // the ruled left margin
  gutter: 18,   // page gutter on a 360dp device
};

export const BORDER_RADIUS = {
  sm: 10, md: 16, lg: 20, xl: 28, pill: 999,
  // additions
  stamp: 3,     // stamps are nearly square — a stamp is not a pill
  sheet: 14,    // cards are sheets, not lozenges
};
```

### 6.3 New typography tokens

```ts
export const FONTS = {
  regular: { fontWeight: '400' as const },
  medium: { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold: { fontWeight: '600' as const },
  // additions — families are loaded via expo-font; these are the family names.
  display: { fontFamily: 'Archivo_700Bold' },      // headings, status words
  body: { fontFamily: 'Archivo_400Regular' },
  mono: { fontFamily: 'MartianMono_700Bold' },     // ETA, order id, code, money
  monoRegular: { fontFamily: 'MartianMono_400Regular' },
  stamp: { fontFamily: 'Archivo_700Bold', letterSpacing: 1.2, textTransform: 'uppercase' as const },
};
```

### 6.4 New layout constants (screen-local, not theme)

These are screen-scoped and should live in `OrderDetailScreen.tsx`, not the
shared theme, because they encode this screen's rules:

```ts
const HIT = { minHeight: 48, minWidth: 48 };       // every interactive control
const STICKY_BAR_HEIGHT = 76;                       // sticky action bar
const CONTENT_BOTTOM_PAD = STICKY_BAR_HEIGHT + 24;  // replaces paddingBottom: 150
```

---

## 7. Contrast working

Computed with the WCAG 2.x relative-luminance formula against the literal hex
values. `(L_hi + 0.05) / (L_lo + 0.05)`.

**Current screen (failures bold):**

| Pair | Ratio | Where |
|------|-------|-------|
| `#94A3B8` on `#FFFFFF` | **2.56** | `trackingInfoLabel` `716`, `riderLabel` `736` |
| `#94A3B8` on `#F8FAFC` | **2.45** | muted text on app background |
| `#99F6E4` on `#0F766E` | **4.34** | `amountLabel` `619`, used `337` |
| `#64748B` on `#FFFFFF` | 4.76 | `textSecondary` (theme) — passes, thin |
| `#64748B` on `#F8FAFC` | 4.55 | `billHelpText` `844` — passes, thin |
| `#475569` on `#FFFFFF` | 7.58 | `bodyText` `679` — passes comfortably |
| `#92400E` on `#FFFBEB` | 6.84 | stale banner text `115` / `bannerStale` `780` — passes |
| `#B45309` on `#FFFFFF` | 5.02 | delivery-code expiry (`DeliveryCodeCard.tsx:154`) — passes |
| `#FFFFFF` on `#0F766E` | 5.47 | `statusText` `610` |

**Proposed tokens:**

| Pair | Ratio |
|------|-------|
| `#0E1B1A` on `#F6F4EF` | 16.05 |
| `#43524F` on `#F6F4EF` | 7.47 |
| `#5C6B68` on `#F6F4EF` | 5.08 |
| `#5C6B68` on `#FFFFFF` | 5.59 |
| `#0B4F4A` on `#F6F4EF` | 8.56 |
| `#0B4F4A` on `#E4F3F0` | 8.24 |
| `#8A3A0B` on `#FDF3E3` | 7.10 |
| `#9A1B1B` on `#FBECEC` | 7.19 |
| `#7A4A06` on `#F6F4EF` | 6.80 |

Every proposed pair clears 4.5:1. All figures above were produced by the script
in the run log; no ratio is estimated.

---

## 8. What the mockup contains

`mockup.html` is a single self-contained file — inline CSS, no dependencies, one
Google-Fonts link for Archivo and Martian Mono with a system fallback.

- **Desktop (≥ 980px):** the **current** screen and the **redesigned** screen
  side by side in two phone frames, with a problem-index legend underneath so a
  reviewer can trace each diagnosis to the pixel it fixes.
- **Narrow (≤ 640px):** the two frames stack, current above redesign.
- **Four states, switchable:** *Live*, *Loading*, *Empty* (no updates yet /
  cancelled) and *Error*. The same four states render for the current design so
  the comparison is like-for-like.
- Both frames are **360px wide** inside their chrome, which is the width the
  brief asks for.
- The whole document renders correctly with JavaScript disabled: the state
  switcher degrades to showing the Live state.

Open it directly with `file://` — no server, no build step.
