import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

/**
 * The rider is the one at the customer's door, so the "customer wants extra
 * milk" request is captured here. These assertions pin the two modes the API
 * distinguishes: a single `[EXTRA:]` for today, and a recurring `[ADD-ON:]`
 * (with an AM/PM slot) for the coming days.
 */
describe('rider extra-milk / add-on dialog', () => {
  const screen = read('RiderRunDetailScreen.tsx');
  const service = read('../../api/subscriptionOperationsService.ts');

  it('offers a Today-only vs Coming-days choice', () => {
    expect(screen).toContain("const extraWhen: 'today' | 'next' = extraDays > 1 ? 'next' : 'today'");
    expect(screen).toContain('Today only');
    expect(screen).toContain('Coming days');
  });

  it('sends the add-on slot only for a recurring add-on', () => {
    expect(screen).toContain('targetSlot: days > 1 ? slot : undefined');
    expect(screen).toContain("Morning (AM)");
    expect(screen).toContain("Evening (PM)");
  });

  it('shows the exact marker the store grid will read', () => {
    expect(screen).toContain('[ADD-ON: ${extraQty}|${Math.round(Number(extraPriceRupees || 0) * 100)}|${extraSlot}]');
    expect(screen).toContain('[EXTRA: ${extraQty}|${Math.round(Number(extraPriceRupees || 0) * 100)}]');
  });

  it('replays a double-tap under one idempotency key', () => {
    expect(screen).toContain('idempotencyKey: `${selectedStop.id}:${extraKeyRef.current}`');
    expect(service).toContain("headers: { 'idempotency-key': idempotencyKey }");
  });

  it('mints a remount-safe idempotency key when the dialog opens', () => {
    // A per-component counter restarts on remount, so a reopened screen would
    // reuse an already-consumed key and replay the prior add-on. The nonce is
    // module-scoped, so it keeps advancing across remounts.
    expect(screen).toContain('let extraMilkNonce = 0');
    expect(screen).toContain('extraMilkNonce += 1');
    expect(screen).toContain('extraKeyRef.current = nextExtraMilkNonce()');
    expect(screen).not.toContain('extraKeyRef.current += 1');
    expect(screen).not.toContain('const extraKeyRef = useRef(0)');
  });

  it('surfaces an existing recurring add-on, not only a one-day extra', () => {
    expect(screen).toContain('Scheduled add-on:');
    expect(screen).toMatch(/\[\(EXTRA\|ADD-ON\)/);
  });
});
