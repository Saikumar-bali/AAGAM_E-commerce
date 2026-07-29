import {
  allPickupItemsChecked,
  buildPickupChecklistLines,
  checkedStateFromTask,
  normalizeParcelCount,
  pickupReadinessLabel,
} from './pickupOperations';

const checklist = [
  { orderItemId: 'a', expectedQuantity: 2, checkedQuantity: 0 },
  { orderItemId: 'b', expectedQuantity: 1, checkedQuantity: 0 },
];

describe('pickup operations helpers', () => {
  it('requires every order line before verification', () => {
    expect(allPickupItemsChecked(checklist, { a: true, b: false })).toBe(false);
    expect(allPickupItemsChecked(checklist, { a: true, b: true })).toBe(true);
  });

  it('builds exact checked quantities for the API', () => {
    expect(buildPickupChecklistLines(checklist, { a: true, b: false })).toEqual([
      { orderItemId: 'a', checkedQuantity: 2 },
      { orderItemId: 'b', checkedQuantity: 0 },
    ]);
  });

  it('hydrates a verified task as fully checked', () => {
    expect(checkedStateFromTask({ status: 'VERIFIED', checklist })).toEqual({ a: true, b: true });
  });

  it('normalizes parcel counts and readiness copy', () => {
    expect(normalizeParcelCount('0')).toBe(1);
    expect(normalizeParcelCount('4')).toBe(4);
    expect(normalizeParcelCount('400')).toBe(100);
    expect(pickupReadinessLabel('PROBLEM_REPORTED')).toContain('problem');
  });
});
