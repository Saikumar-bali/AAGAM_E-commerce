import { BadRequestException } from '@nestjs/common';
import {
  isOpenAt,
  minutesToLabel,
  nextOpenAt,
  normalizeOperatingHours,
  windowWithinOpenHours,
  zonedCalendarDate,
  zonedSlotInstant,
} from './operating-hours';

const DAY_STORE_HOURS = [
  { dayOfWeek: 1, windows: [{ openMinute: 6 * 60, closeMinute: 21 * 60 }] },
  { dayOfWeek: 2, windows: [{ openMinute: 6 * 60, closeMinute: 21 * 60 }] },
  { dayOfWeek: 3, windows: [{ openMinute: 6 * 60, closeMinute: 21 * 60 }] },
  { dayOfWeek: 4, windows: [{ openMinute: 6 * 60, closeMinute: 21 * 60 }] },
  { dayOfWeek: 5, windows: [{ openMinute: 6 * 60, closeMinute: 21 * 60 }] },
  { dayOfWeek: 6, windows: [{ openMinute: 6 * 60, closeMinute: 21 * 60 }] },
];

describe('operating-hours normalization', () => {
  test('empty input means always open', () => {
    expect(normalizeOperatingHours(null)).toEqual([]);
    expect(normalizeOperatingHours(undefined)).toEqual([]);
  });

  test('rejects out-of-range days and minutes', () => {
    expect(() => normalizeOperatingHours([{ dayOfWeek: 7, windows: [{ openMinute: 0, closeMinute: 60 }] }])).toThrow(BadRequestException);
    expect(() => normalizeOperatingHours([{ dayOfWeek: 0, windows: [{ openMinute: 1500, closeMinute: 1510 }] }])).toThrow(BadRequestException);
    expect(() => normalizeOperatingHours([{ dayOfWeek: 0, windows: [{ openMinute: 60, closeMinute: 60 }] }])).toThrow(BadRequestException);
  });

  test('rejects duplicate days and overlapping windows', () => {
    expect(() => normalizeOperatingHours([
      { dayOfWeek: 0, windows: [{ openMinute: 0, closeMinute: 60 }] },
      { dayOfWeek: 0, windows: [{ openMinute: 120, closeMinute: 180 }] },
    ])).toThrow(BadRequestException);
    expect(() => normalizeOperatingHours([
      { dayOfWeek: 0, windows: [{ openMinute: 360, closeMinute: 480 }, { openMinute: 420, closeMinute: 540 }] },
    ])).toThrow(BadRequestException);
  });

  test('accepts overnight windows', () => {
    expect(normalizeOperatingHours([
      { dayOfWeek: 0, windows: [{ openMinute: 22 * 60, closeMinute: 2 * 60 }] },
    ])).toEqual([{ dayOfWeek: 0, windows: [{ openMinute: 1320, closeMinute: 120 }] }]);
  });
});

describe('isOpenAt', () => {
  const store = { operatingHours: DAY_STORE_HOURS, timezone: 'Asia/Kolkata' };

  test('always open when no hours configured', () => {
    expect(isOpenAt({ operatingHours: null }, new Date('2026-08-17T04:00:00Z'))).toBe(true);
  });

  test('open inside a window', () => {
    expect(isOpenAt(store, new Date('2026-08-17T04:00:00Z'))).toBe(true); // Mon 09:30 IST
  });

  test('closed outside a window', () => {
    expect(isOpenAt(store, new Date('2026-08-17T17:00:00Z'))).toBe(false); // Mon 22:30 IST
  });

  test('closed on a day without hours', () => {
    const sundayStore = { operatingHours: DAY_STORE_HOURS, timezone: 'Asia/Kolkata' };
    expect(isOpenAt(sundayStore, new Date('2026-08-16T04:00:00Z'))).toBe(false); // Sun 09:30 IST
  });

  test('overnight window crossing midnight', () => {
    const overnight = { operatingHours: [{ dayOfWeek: 0, windows: [{ openMinute: 22 * 60, closeMinute: 2 * 60 }] }], timezone: 'Asia/Kolkata' };
    expect(isOpenAt(overnight, new Date('2026-08-16T18:00:00Z'))).toBe(true); // Sun 23:30 IST
    expect(isOpenAt(overnight, new Date('2026-08-16T19:30:00Z'))).toBe(false); // Mon 01:00 IST
    expect(isOpenAt(overnight, new Date('2026-08-16T20:30:00Z'))).toBe(false); // Mon 02:00 IST
  });

  test('malformed stored hours fail safe to always open', () => {
    expect(isOpenAt({ operatingHours: [{ dayOfWeek: 9, windows: [] }] }, new Date())).toBe(true);
  });
});

describe('nextOpenAt', () => {
  const store = { operatingHours: DAY_STORE_HOURS, timezone: 'Asia/Kolkata' };

  test('returns the next morning window when closed in the evening', () => {
    const closedAt = new Date('2026-08-17T17:00:00Z'); // Mon 22:30 IST
    const next = nextOpenAt(store, closedAt)!;
    expect(next.toISOString()).toBe('2026-08-18T00:30:00.000Z'); // Tue 06:00 IST
  });

  test('returns from itself when currently open', () => {
    const openAt = new Date('2026-08-17T04:00:00Z');
    expect(nextOpenAt(store, openAt)!.getTime()).toBe(openAt.getTime());
  });

  test('always open stores are open at any instant', () => {
    const always = { operatingHours: null, timezone: 'Asia/Kolkata' };
    const now = new Date();
    expect(nextOpenAt(always, now)!.getTime()).toBe(now.getTime());
  });
});

describe('windowWithinOpenHours', () => {
  const store = { operatingHours: DAY_STORE_HOURS, timezone: 'Asia/Kolkata' };

  test('accepts windows fully inside open hours', () => {
    const start = new Date('2026-08-18T01:00:00Z'); // Tue 06:30 IST
    expect(windowWithinOpenHours(store, start, new Date(start.getTime() + 3 * 60 * 60_000))).toBe(true);
  });

  test('rejects windows outside open hours', () => {
    const start = new Date('2026-08-18T16:00:00Z'); // Tue 21:30 IST
    expect(windowWithinOpenHours(store, start, new Date(start.getTime() + 60 * 60_000))).toBe(false);
  });

  test('rejects windows straddling closing time', () => {
    const start = new Date('2026-08-18T15:30:00Z'); // Tue 21:00 IST
    expect(windowWithinOpenHours(store, start, new Date(start.getTime() + 60 * 60_000))).toBe(false);
  });
});

describe('timezone slot math', () => {
  test('zonedSlotInstant builds instants in the store timezone', () => {
    const date = zonedCalendarDate(new Date('2026-08-17T04:00:00Z'), 'Asia/Kolkata'); // Mon 09:30 IST
    expect(date).toEqual({ year: 2026, month: 7, day: 17 });
    const instant = zonedSlotInstant(date, 0, 6 * 60, 'Asia/Kolkata');
    expect(instant.toISOString()).toBe('2026-08-17T00:30:00.000Z'); // Mon 06:00 IST
  });

  test('minutesToLabel formats 12-hour labels', () => {
    expect(minutesToLabel(6 * 60)).toBe('6 AM');
    expect(minutesToLabel(21 * 60)).toBe('9 PM');
    expect(minutesToLabel(0)).toBe('12 AM');
    expect(minutesToLabel(12 * 60)).toBe('12 PM');
    expect(minutesToLabel(6 * 60 + 30)).toBe('6:30 AM');
  });
});