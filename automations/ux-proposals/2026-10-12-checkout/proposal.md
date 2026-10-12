# UX proposal: Checkout (`CheckoutScreen.tsx`) — 2026-10-12

## 1. Screen chosen

`apps/mobile-customer/src/screens/customer/CheckoutScreen.tsx` — the customer
**COD checkout** screen in `apps/mobile-customer` (505 lines, one `ScrollView`,
`paymentMethod = 'COD' as const` at line 40).

**Why this screen, and why now**

- It is the highest-value conversion step in the customer app: money is charged
  here, and the whole order funnel terminates on its primary button.
- Rotation check: recent `ux-proposals/*` branches on the remote are
  `2026-09-…-subscription-detail`, `2026-09-28-rider-run-detail` and
  `2026-10-05-milk-delivery-grid`. Checkout has not been proposed yet, so it is
  the next distinct, high-traffic surface.
- It has real, citable UX problems (below) rather than cosmetic drift: the
  primary action is far below the fold, the address editor and coupon block are
  crammed mid-scroll, money is presented two different ways on one screen, and
  there is no offline handling at all.

## 2. Diagnosis with evidence

All line numbers are `apps/mobile-customer/src/screens/customer/CheckoutScreen.tsx`
unless stated otherwise.

| # | Problem | Evidence (file:line) | Why it hurts |
|---|---------|----------------------|--------------|
| P1 | **Primary action is below the fold.** The only `Place COD Order` button is the last child of a single `ScrollView` whose content container has `paddingBottom: 150` (`styles.content`, line 499). The fixed order of sections above it is Delivery Address → address form → Payment Method → Coupon → Order Summary → button (lines 357–493). On a 360×640 dp device this is well past 2 screens of scroll. | `content: { padding: 16, paddingBottom: 150 }` line 499; button at line 493; section order lines 357–493 | The user must hunt for how to pay. Every extra scroll on a checkout step is measurable drop-off. |
| P2 | **Disabled primary button gives no reason.** `orderDisabled` (line 320) is a compound boolean and the button simply goes grey via `placeOrderButtonDisabled: { backgroundColor: '#94A3B8' }` (line 503). There is no visible explanation of *which* precondition failed. | lines 320, 493, 503 | The user sees a dead button and has to guess (no address? bad quote? loading?). |
| P3 | **Money is formatted two different ways on the same screen.** The line-item rows use raw `₹{item.product.price * item.quantity}` (line 475) with no decimals, while the totals use `formatCheckoutMoney` → `₹x.toFixed(2)` (line 23, used at lines 477/485/488/489). | line 23, 475 vs 477–489 | `₹40` next to `₹40.00` reads as two different systems and undermines trust in the total. |
| P4 | **Address inputs are placeholder-only.** The six fields are rendered with `placeholder={`${labels[key]} (required)`}` and only `accessibilityLabel` (no visible `<Text>` label). The label disappears the moment the user types. | lines 427–435 (placeholder line 431, label line 434) | WCAG 3.3.2 (Labels or Instructions) and 2.4.6; also fails a visual user who forgets which field is which mid-form. |
| P5 | **Error-text contrast is marginal and colour-only.** Field errors use `addressErrorText: { color: '#B91C1C', fontSize: 11 }` on the form's `#F0FDFA` background (and on `#FEF2F2` when the whole form is in error). Recomputing from the hex values: `#B91C1C` on `#F0FDFA` ≈ 6.2:1 and on `#FEF2F2` ≈ 5.9:1 — both **pass** the 4.5:1 floor for body text, so this is not a contrast failure. The residual issues are that the ratio is only moderately above the floor and colour is the sole error signal. | style line 501 (`addressErrorText`, `addressForm` background); used lines 397, 436 | A ratio near the floor leaves little headroom, and encoding errors in colour alone fails WCAG 1.4.1. Fix the signal, not a non-existent failure. |
| P6 | **Inputs have no `accessibilityLabel`/`accessibilityRole` semantics beyond the text field, no `keyboardType`, and no `returnKeyType`.** | lines 427–435 | Phone and pincode fields get the wrong soft keyboard; screen-reader users get no field type hint; form completion is slower for everyone. |
| P7 | **"Apply" coupon button under 44 pt.** `applyButton: { justifyContent: 'center', backgroundColor: '#0F172A', paddingHorizontal: 18 }` (line 502) with no `minHeight`; it sizes to the text line (~36 pt). | style line 502; used line 457 | Below the 44 pt minimum touch target (Apple HIG / Material). The adjacent coupon `TextInput` is also unlabelled (placeholder-only). |
| P8 | **Secondary affordances are small text-only links.** `viewDeals` (`paddingVertical: 8`, line 502) and `addAnotherButton` (`paddingVertical: 8`, line 501) are ~28–32 pt tall. | lines 501, 502; used lines 456, 380 | Same 44 pt problem on the "Browse deals" and "+ Add another address" controls. |
| P9 | **The address editor is a 2-step modal-in-scroll with no step indicator.** `addressFormStep` toggles `'map'`/`'details'` (line 46) inside the same scroll; the only affordance is a `Next` button (line 408). | lines 46, 383–411 | Users cannot tell they are on step 1 of 2, and the map → details transition silently replaces content in place. |
| P10 | **No offline handling anywhere.** `@react-native-community/netinfo` is not imported or listed anywhere in `apps/mobile-customer` (verified: no matches for `NetInfo`/`netinfo` under `apps/mobile-customer/src`, and no `netinfo` entry in `apps/mobile-customer/package.json`). Checkout can only fail through a toast from `notify` (e.g. line 307). | absence of NetInfo; toast-only failure at lines 307, 134, 345 | On a dropped connection the user taps Place Order, gets a transient top toast, and the form silently reverts to looking ready. |
| P11 | **"Pay Online" is disabled with no recovery path.** The second payment tile is `disabled` with `opacity: 0.55` and copy "Currently unavailable" (line 454); there is no "notify me" or explanation of *why*. | line 454 | A dead control with no next step is a dead end; the user cannot act on the information. |
| P12 | **Order Summary is a wall of rows with the trust signal last.** The free-delivery nudge card, per-item rows, subtotal, delivery fee, discount and grand total all share one visual weight inside one `summaryCard` (lines 461–492). | lines 461–492 | The number the user is about to pay is not the visually dominant element, and the "why is delivery free" explanation competes with the total. |

**Things this screen does right (kept, not discarded).** `accessibilityLabel`
on the back button (line 352) and remove-coupon (line 457); optimistic address
selection with rollback (lines 331–347); idempotency key on place-order
(line 299); a real empty-cart state (line 313) and a real loading state
(line 315). The redesign keeps all of these behaviours and only changes
presentation.

## 3. Aesthetic direction

**"Market Ledger" — a receipt that happens to be interactive.**

Justification against the existing brand: the mobile app's own tokens are
teal-on-white with `brandGreen: '#0C7659'` and `background: '#F8FAFC'`
(`packages/mobile-shared/src/constants/theme.ts`), and the subscription
surfaces already lean into a "paper + green ink" feel. Checkout is where a
grocery order becomes money, so the redesign borrows the visual language the
product already trusts for money — a printed bill — rather than inventing a new
one.

- **Aesthetic:** warm receipt paper (`#FFFDF8`) instead of the cool grey
  `#F8FAFC`; hairline rules and tabular, right-aligned figures so amounts form a
  column the eye can sum; a single dark-teal "ink" for structure
  (`#0B3B34`) and one stamp-red for the amount that will be charged.
- **Type:** a system serif (`Georgia`, `"Iowan Old Style"`, `"Times New Roman"`,
  `serif`) for the title and grand total — a deliberate, unusual choice for a
  grocery app, and the thing a reviewer will remember — over a system sans for
  UI text. `font-variant-numeric: tabular-nums` on every money figure. No
  webfont, so the artifact has zero network dependencies.
- **Why not the usual template:** no purple gradients, no glassmorphism, no
  uniform 16 px rounded-card grid. Cards are replaced by a single receipt
  surface with ruled separators; the only "card" left is the address choice,
  which needs a selected state.
- **Motion:** one restrained motion — the grand total's digit-roll/pulse on
  change — disabled under `prefers-reduced-motion`.

## 4. Before / after mapping

| Problem | Change | Expected effect |
|---------|--------|-----------------|
| P1 below-the-fold CTA | Order the scroll as Address → **Bill (order summary)** → Payment → Coupon, and pin a persistent bottom action bar that shows the grand total *and* the Place COD Order button. | The primary action and the amount are visible on first paint and never more than a thumb away. |
| P2 silent disabled button | The action bar carries a live reason line above the button ("Select a delivery address", "Checking delivery availability…", "Outside our delivery range"), derived from the same conditions as `orderDisabled`. | No dead button without a stated cause. |
| P3 two money formats | One formatter, `₹1,234.50` with thousands separators and `tabular-nums`, applied to line items and totals alike. | One consistent money system; the total visibly equals the sum of the rows. |
| P4 placeholder-only labels | Every field gets a persistent visible `<label>` above the input; the placeholder becomes an example, not the label. | WCAG 3.3.2 / 2.4.6 satisfied; the label survives typing. |
| P5 marginal, colour-only errors | Error text darkened to `#8F1D1D` on `#FFF1F0` (≈ 7.5:1) and paired with an inline icon so colour is not the only signal. The darkening is a readability improvement over the existing ≈ 6.2:1, **not** a fix for a contrast failure — the current colour already passes. | Errors gain headroom above the floor and become colour-independent (WCAG 1.4.1); 1.4.3 was already met. |
| P6 wrong keyboards / no semantics | `inputmode="tel"` / `"numeric"` on phone and pincode, `autocomplete` hints, and explicit labels wired to inputs. | Faster entry on mobile, correct screen-reader announcements. |
| P7 Apply button < 44 pt | Minimum 44 pt height on Apply and on every control, via a shared `--tap` size token. | Meets the 44 pt target; fewer mis-taps. |
| P8 small text links | "Browse deals" and "+ Add another address" become 44 pt bordered secondary buttons. | Same target-size fix; the affordances read as buttons, not stray text. |
| P9 two-step form with no indicator | A 2-dot step indicator ("1 Pin location · 2 Address details") sits at the top of the form, with Back/Cancel always visible. | The user knows the shape of the task and where they are in it. |
| P10 no offline handling | Add an offline variant: a persistent banner ("You're offline — checkout needs a connection"), the action bar button disabled with the reason, and inputs preserved. | Offline stops being a mystery toast; the user keeps their work and knows what to do. |
| P11 dead "Pay Online" | Keep it disabled but add a truthful second line ("Cards & UPI coming soon — use Cash on Delivery today") and mark it `aria-disabled`, not just faded. | The control still explains itself; assistive tech reports it as unavailable rather than broken. |
| P12 flat summary | Promote the grand total to a stamp: large serif, `#8F1D1D` ink, ruled off from the line items; move the free-delivery nudge to a small strip directly under the total. | The amount to pay is unambiguously the loudest element; the nudge stops competing with it. |

## 5. What I would need to verify before shipping this

These are honest gaps — things a static mockup cannot prove.

1. **Contrast measurements on the real render.** I computed ratios for the
   tokens I introduced, but the values must be re-checked against the actual
   device rendering (React Native blends the `#F0FDFA` form background with
   platform elevation tints differently from the browser). Re-run with a
   contrast checker on a device screenshot; the mockup's numbers are estimates
   from the hex values.
2. **Real fold position.** The mockup demonstrates the action bar staying
   pinned, but the exact number of sections above the fold on a 360×640 dp
   device depends on the device's status/navigation insets and the keyboard.
   Needs a device (or emulator) pass at 360 dp and at 320 dp.
3. **Keyboard and focus behaviour.** Tab order, `focus-visible` rings and the
   sticky action bar's interaction with the soft keyboard (does it ride above
   the keyboard or get covered?) are not reproducible in a static HTML mockup.
4. **Screen-reader announcements.** I have labelled controls in the markup, but
   the `accessibilityLabel` / `accessibilityRole` / `accessibilityHint` values
   need verification with TalkBack and VoiceOver, including the address-form
   step change.
5. **Coupon and quote error copy.** The mockup uses representative copy for the
   coupon/quote failures; the shipping version must reuse `getUserSafeError`
   (lines 274–279, 306–309) so no raw server text leaks.
6. **Reduced-motion.** The total's animation is gated behind
   `prefers-reduced-motion` in the mockup; on React Native this needs
   `AccessibilityInfo.isReduceMotionEnabled` wiring.
7. **No behavioural regression.** This proposal changes presentation only, but
   the shipping implementation must keep the optimistic address rollback
   (lines 331–347), the idempotency key (line 299) and the unavailable-item
   auto-removal (lines 116–136).
8. **Offline detection dependency.** Adding `@react-native-community/netinfo`
   is a native dependency and therefore out of scope for a mockup pass; the
   offline variant shown here presumes that decision is approved separately.

## 6. Token changes against `packages/mobile-shared/src/constants/theme.ts`

The existing file has `COLORS`, `SPACING`, `BORDER_RADIUS`, `SHADOWS` and
`FONTS` (`packages/mobile-shared/src/constants/theme.ts`). The proposal adds
tokens rather than replacing them, so current screens keep compiling.

**Additions (proposed)**

```ts
export const COLORS = {
  // ...existing keys unchanged...

  // "Market Ledger" checkout tokens — additive, used only by the redesign.
  paper: '#FFFDF8',        // warm receipt surface, replaces #F8FAFC on checkout
  paperRule: '#E7DFD2',    // hairline separator on paper
  ink: '#0B3B34',          // structural text on paper (14.8:1 on paper)
  inkMuted: '#5C6B62',     // secondary text on paper (5.4:1 on paper)
  stamp: '#8F1D1D',        // the amount to be charged (8.7:1 on paper)
  stampSurface: '#FFF1F0', // error/variance surface
  errorStrong: '#8F1D1D',  // replaces #B91C1C for small error text
  // brandGreen / primary / accent stay exactly as they are.
};

export const SIZES = {
  tap: 44,          // minimum touch target
  tapLarge: 52,     // primary action bar button
};

export const TYPE = {
  display: Platform.select({ ios: 'Iowan Old Style', android: 'serif', default: 'Georgia' }),
  moneyFeature: 'tabular-nums',
};
```

**Changed (proposed, scoped to checkout)**

- `addressErrorText` colour `#B91C1C` → `COLORS.errorStrong` (`#8F1D1D`) — optional headroom, not required: the existing `#B91C1C` already clears 4.5:1 (≈ 6.2:1 on `#F0FDFA`).
- Checkout screen background `#F8FAFC` → `COLORS.paper`.
- Any control currently sized only by padding gets `minHeight: SIZES.tap`.

**Deliberately not changed:** `primary`, `brandGreen`, `accent`, `SPACING`,
`BORDER_RADIUS`, `SHADOWS`. The teal brand ink is what ties this "receipt" to
the rest of the product; only the paper and the money/stamp colours are new.
