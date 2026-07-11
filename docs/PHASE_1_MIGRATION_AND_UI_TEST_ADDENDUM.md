# Phase 1 Migration and UI Test Addendum

Use this addendum together with `docs/PHASE_1_NOTIFICATION_SCENARIO_TESTING.md`.

## Required migrations

Both migrations must be applied, in order:

```text
20260711083000_phase_1_notification_outbox
20260711084500_phase_1_expiry_event_dedupe
```

The second migration prevents multiple workers or legacy workspace reconciliation from producing duplicate `ASSIGNMENT_EXPIRED` delivery events.

Verify:

```sql
SELECT indexname
FROM pg_indexes
WHERE indexname = 'DeliveryEvent_one_assignment_expiry';
```

Expected: one row.

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
