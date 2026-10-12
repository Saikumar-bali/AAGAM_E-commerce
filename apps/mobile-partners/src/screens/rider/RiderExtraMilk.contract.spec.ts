import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

/**
 * The rider is the one at the customer's door, so the "customer wants extra
 * milk" request is captured here. The dialog lives in the map console's
 * focused-stop expander; these assertions pin the two modes the API
 * distinguishes: a single-day `[EXTRA:]`, and a recurring `[ADD-ON:]` (with an
 * AM/PM slot) for the coming days. The client no longer mints the marker —
 * the server stamps it into the delivery's deferredReason — so the contract
 * is round-trip: what we send, and what we parse back for the rider.
 */
describe('rider extra-milk / add-on dialog', () => {
  const screen = read('RiderRunConsole.tsx');
  const service = read('../../api/subscriptionOperationsService.ts');

  it('offers a Today vs recurring-days choice', () => {
    expect(screen).toContain('const [extraDays, setExtraDays] = useState(1)');
    expect(screen).toContain("{days === 1 ? 'Today' : `${days} days`}");
    expect(screen).toContain('>Attach extra milk<');
  });

  it('sends the add-on slot only for a recurring add-on', () => {
    expect(screen).toContain('consecutiveDays: extraDays');
    expect(screen).toContain('targetSlot: extraDays > 1 ? extraSlot : undefined');
    // The slot picker only renders once the rider chose more than one day,
    // so a single-day extra can never carry a slot.
    expect(screen).toContain("extraDays > 1 ? (['AM', 'PM'] as const)");
    expect(screen).toContain('{slot} slot');
    expect(service).toContain("targetSlot?: 'AM' | 'PM'");
    expect(service).toContain('consecutiveDays?: number');
  });

  it('parses the exact markers the server stamps for the store grid', () => {
    // Both marker shapes the API writes must parse: a one-day
    // `[EXTRA: 1L|2]`-style note and a recurring `[ADD-ON: 1L|3|AM]`.
    expect(screen).toContain('reason.match(/\\[(EXTRA|ADD-ON):');
    expect(screen).toContain('function extraCountFor(stop: DeliveryRunStop)');
    // The summed litres surface on the focused stop so the rider can verify.
    expect(screen).toContain('focusExtra > 0');
    expect(screen).toContain('+{focusExtra}L extra');
  });

  it('replays a double-tap under one idempotency key per tap', () => {
    expect(screen).toContain('`console-extra-${stop.id}-${Date.now()}`');
    // Single-flight: runAction refuses re-entry and the expander action is
    // disabled while the mutation is pending, so one tap = one key.
    expect(screen).toContain('if (busy) return;');
    expect(screen).toContain("disabled={busy === 'extra'}");
    expect(service).toContain("headers: { 'idempotency-key': idempotencyKey }");
  });

  it('surfaces an existing add-on without reading its price as a repeat count', () => {
    // Group 3 of the marker is the add-on price in paise on the single-day
    // `[EXTRA: 1L|<paise>]` form, or the AM/PM slot on the recurring
    // `[ADD-ON: 1L|<paise>|AM]` form - never a repeat count. Only the quantity
    // literal is read, so `[ADD-ON: 1L|3000|AM]` surfaces "+1L", not "+3000L".
    expect(screen).toContain('function extraCountFor(stop: DeliveryRunStop)');
    expect(screen).not.toContain('match[3]');
  });
});
