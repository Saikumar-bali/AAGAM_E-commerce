import { DEFAULT_PREORDER_SLOTS, istCalendarDate, istSlotInstant } from './delivery-slots';

describe('IST delivery slots', () => {
  it('defines the requested morning and evening windows', () => {
    expect(DEFAULT_PREORDER_SLOTS).toEqual([
      { label: 'Morning', startMinute: 390, endMinute: 570 },
      { label: 'Evening', startMinute: 960, endMinute: 1230 },
    ]);
  });

  it('creates the same IST wall-clock time regardless of the server timezone', () => {
    const date = istCalendarDate(new Date('2026-08-15T01:00:00.000Z'));
    expect(istSlotInstant(date, 0, 390).toISOString()).toBe('2026-08-15T01:00:00.000Z');
    expect(istSlotInstant(date, 0, 570).toISOString()).toBe('2026-08-15T04:00:00.000Z');
    expect(istSlotInstant(date, 0, 960).toISOString()).toBe('2026-08-15T10:30:00.000Z');
    expect(istSlotInstant(date, 0, 1230).toISOString()).toBe('2026-08-15T15:00:00.000Z');
  });

  it('uses the IST calendar date near the UTC day boundary', () => {
    expect(istCalendarDate(new Date('2026-08-15T20:00:00.000Z'))).toEqual({
      year: 2026,
      month: 7,
      day: 16,
    });
  });
});
