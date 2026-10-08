import { resolveRunActions, mergeRunIntoOpenStop } from '@aagam/utils';

/**
 * Regression coverage for BUG-009 (store Pack button hidden on a dispatched
 * run) — the store's run list gates Pack on `status === 'PLANNED'`, but the
 * same-day dispatch quick action creates the run already in READY_FOR_PICKUP,
 * so Pack never rendered and the run's packedBagCount stayed 0.
 */
describe('store run Pack/Handoff gating', () => {
  test('offers Pack on a dispatched READY_FOR_PICKUP run whose bags are unpacked', () => {
    const actions = resolveRunActions({
      status: 'READY_FOR_PICKUP',
      totalStopCount: 3,
      expectedBagCount: 3,
      packedBagCount: 0,
      stopCount: 3,
    });
    expect(actions.canPack).toBe(true);
    expect(actions.canHandoff).toBe(false);
  });

  test('offers Handoff once the bags are packed on a READY_FOR_PICKUP run', () => {
    const actions = resolveRunActions({
      status: 'READY_FOR_PICKUP',
      totalStopCount: 3,
      expectedBagCount: 3,
      packedBagCount: 3,
      stopCount: 3,
    });
    expect(actions.canPack).toBe(false);
    expect(actions.canHandoff).toBe(true);
  });

  test('offers Pack on a freshly generated PLANNED run', () => {
    const actions = resolveRunActions({
      status: 'PLANNED',
      totalStopCount: 2,
      expectedBagCount: 2,
      packedBagCount: 0,
      stopCount: 2,
    });
    expect(actions.canPack).toBe(true);
    expect(actions.canHandoff).toBe(false);
  });

  test('falls back to the loaded stop count when no bag target is set', () => {
    const actions = resolveRunActions({
      status: 'READY_FOR_PICKUP',
      totalStopCount: 0,
      expectedBagCount: 0,
      packedBagCount: 0,
      stopCount: 4,
    });
    expect(actions.bagTarget).toBe(4);
    expect(actions.canPack).toBe(true);
  });

  test('never offers Pack or Handoff on a terminal run', () => {
    for (const status of ['CANCELLED', 'COMPLETED']) {
      const actions = resolveRunActions({
        status,
        totalStopCount: 3,
        expectedBagCount: 3,
        packedBagCount: 0,
        stopCount: 3,
      });
      expect(actions.canPack).toBe(false);
      expect(actions.canHandoff).toBe(false);
    }
  });
});

/**
 * Regression coverage for BUG-008 (rider stop panel stale after arrive()): the
 * open stop snapshot must track the refreshed run payload so the completion
 * form gated on the fresh status renders.
 */
describe('rider open stop refresh', () => {
  test('merges the refreshed stop over the open snapshot', () => {
    const current = { id: 'stop-1', status: 'ASSIGNED', version: 0 };
    const merged = mergeRunIntoOpenStop(current, [
      { id: 'stop-1', status: 'ARRIVED', version: 1 },
      { id: 'stop-2', status: 'ASSIGNED', version: 0 },
    ]);
    expect(merged).toEqual({ id: 'stop-1', status: 'ARRIVED', version: 1 });
  });

  test('keeps the current snapshot when the stop is absent from the refresh', () => {
    const current = { id: 'stop-9', status: 'ASSIGNED' };
    expect(mergeRunIntoOpenStop(current, [{ id: 'stop-1', status: 'ARRIVED' }])).toBe(current);
  });

  test('returns null when no stop is open', () => {
    expect(mergeRunIntoOpenStop(null, [{ id: 'stop-1', status: 'ARRIVED' }])).toBeNull();
  });
});
