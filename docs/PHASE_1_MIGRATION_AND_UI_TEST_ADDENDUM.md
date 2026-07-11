# Phase 1 Migration and UI Test Addendum

Use this addendum together with `docs/PHASE_1_NOTIFICATION_SCENARIO_TESTING.md`.

## Required migrations

All three migrations must be applied, in order:

```text
20260711083000_phase_1_notification_outbox
20260711084500_phase_1_expiry_event_dedupe
20260711090000_phase_1_payment_safe_order_outbox
```

The second migration prevents multiple workers or legacy workspace reconciliation from producing duplicate `ASSIGNMENT_EXPIRED` delivery events.

The third migration makes order notifications payment-safe:

- COD/non-payment-pending orders enqueue `ORDER_PLACED` immediately.
- online `PAYMENT_PENDING` orders do not notify store/admin yet.
- online orders enqueue `ORDER_PLACED` only when payment capture changes the order to `CONFIRMED`.

Verify:

```sql
SELECT indexname
FROM pg_indexes
WHERE indexname = 'DeliveryEvent_one_assignment_expiry';
```

Expected: one row.

Verify the active trigger function definition:

```sql
SELECT pg_get_functiondef('phase1_order_outbox_trigger'::regproc);
```

Expected: the function contains the `PAYMENT_PENDING` to `CONFIRMED` payment-safe branch.

## Additional automated UI gate

Run:

```bash
npx playwright test --project=phase-1-notifications --headed
```

Expected scenarios:

```text
Admin notification center and broadcast form: PASS
Customer notification center: PASS
Store notification center and navigation: PASS
Rider addressed-offer notification center: PASS
Mobile-width horizontal overflow check: PASS
```

Screenshots are written to:

```text
docs/qa/phase-1-notifications/
```

Real operating-system background notification proof still requires valid Firebase configuration and permission on an actual browser/device. Headless Playwright validates page rendering and controls, not the operating-system notification tray.
