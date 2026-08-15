export const DELIVERY_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 5 * 60 + 30;

export const DEFAULT_PREORDER_SLOTS = [
  { label: 'Morning', startMinute: 6 * 60 + 30, endMinute: 9 * 60 + 30 },
  { label: 'Evening', startMinute: 16 * 60, endMinute: 20 * 60 + 30 },
] as const;

type CalendarDate = { year: number; month: number; day: number };

/** Returns the calendar date in IST without depending on the server's timezone. */
export function istCalendarDate(instant: Date): CalendarDate {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/** Adds calendar days and creates an absolute instant for an IST minute-of-day. */
export function istSlotInstant(date: CalendarDate, dayOffset: number, minuteOfDay: number): Date {
  const calendarDay = new Date(Date.UTC(date.year, date.month, date.day + dayOffset));
  const utcMillis = Date.UTC(
    calendarDay.getUTCFullYear(),
    calendarDay.getUTCMonth(),
    calendarDay.getUTCDate(),
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
  );
  return new Date(utcMillis - IST_OFFSET_MINUTES * 60_000);
}
