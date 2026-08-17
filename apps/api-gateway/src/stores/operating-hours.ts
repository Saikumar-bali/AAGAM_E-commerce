import { BadRequestException } from '@nestjs/common';

export interface OperatingWindow {
  /** Minutes from midnight, 0..1439. */
  openMinute: number;
  /** Minutes from midnight, 0..1439. Lower than openMinute means the window crosses midnight. */
  closeMinute: number;
}

export interface OperatingDay {
  /** JS weekday convention: 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  windows: OperatingWindow[];
}

export type OperatingHours = OperatingDay[];

const MINUTES_PER_DAY = 24 * 60;

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export function normalizeOperatingHours(raw: unknown): OperatingHours {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new BadRequestException('operatingHours must be an array of per-day entries');
  }
  if (raw.length > 7) {
    throw new BadRequestException('operatingHours cannot contain more than 7 days');
  }
  const seenDays = new Set<number>();
  const normalized: OperatingHours = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new BadRequestException('Each operating day must be an object');
    }
    const day = entry as Record<string, unknown>;
    const dayOfWeek = Number(day.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new BadRequestException(`Invalid dayOfWeek: ${String(day.dayOfWeek)}`);
    }
    if (seenDays.has(dayOfWeek)) {
      throw new BadRequestException(`Duplicate operating day: ${dayOfWeek}`);
    }
    seenDays.add(dayOfWeek);
    if (!Array.isArray(day.windows) || day.windows.length === 0) {
      throw new BadRequestException(`Day ${dayOfWeek} must define at least one window`);
    }
    if (day.windows.length > 3) {
      throw new BadRequestException(`Day ${dayOfWeek} cannot define more than 3 windows`);
    }
    const occupancy = new Array<boolean>(MINUTES_PER_DAY).fill(false);
    const windows: OperatingWindow[] = [];
    for (const win of day.windows) {
      const candidate = win as Record<string, unknown>;
      const openMinute = Number(candidate.openMinute);
      const closeMinute = Number(candidate.closeMinute);
      if (!Number.isInteger(openMinute) || openMinute < 0 || openMinute >= MINUTES_PER_DAY) {
        throw new BadRequestException(`Day ${dayOfWeek}: openMinute must be an integer 0..1439`);
      }
      if (!Number.isInteger(closeMinute) || closeMinute < 0 || closeMinute >= MINUTES_PER_DAY) {
        throw new BadRequestException(`Day ${dayOfWeek}: closeMinute must be an integer 0..1439`);
      }
      if (openMinute === closeMinute) {
        throw new BadRequestException(`Day ${dayOfWeek}: a window cannot open and close at the same minute`);
      }
      for (let m = openMinute; m < (closeMinute > openMinute ? closeMinute : MINUTES_PER_DAY); m += 1) {
        if (occupancy[m]) throw new BadRequestException(`Day ${dayOfWeek}: windows must not overlap`);
        occupancy[m] = true;
      }
      if (closeMinute < openMinute) {
        for (let m = 0; m < closeMinute; m += 1) {
          if (occupancy[m]) throw new BadRequestException(`Day ${dayOfWeek}: windows must not overlap`);
          occupancy[m] = true;
        }
      }
      windows.push({ openMinute, closeMinute });
    }
    windows.sort((a, b) => a.openMinute - b.openMinute);
    normalized.push({ dayOfWeek, windows });
  }
  normalized.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  return normalized;
}

export function hasOperatingHours(store: { operatingHours?: unknown }): boolean {
  return Array.isArray(store.operatingHours) && store.operatingHours.length > 0;
}

/** DB values are validated on write; on malformed data fail safe to "always open". */
function hoursOrAlwaysOpen(store: { operatingHours?: unknown }): OperatingHours {
  try {
    return normalizeOperatingHours(store.operatingHours);
  } catch {
    return [];
  }
}

interface ZonedParts {
  year: number;
  month: number; // 0-based, like Date
  day: number;
  dayOfWeek: number;
  minuteOfDay: number;
}

function zonedParts(instant: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(instant);
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  const weekdayIndex: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(values.year),
    month: Number(values.month) - 1,
    day: Number(values.day),
    dayOfWeek: weekdayIndex[values.weekday] ?? 0,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

/** UTC offset of the timezone at the given instant, in milliseconds. */
export function zoneOffsetMillis(instant: Date, timezone: string): number {
  const zoned = zonedParts(instant, timezone);
  const utcMinuteOfDay = instant.getUTCHours() * 60 + instant.getUTCMinutes();
  let diff = zoned.minuteOfDay - utcMinuteOfDay;
  if (diff > 12 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff * 60_000;
}

/** Absolute instant of midnight (start of day) for a zoned calendar date. */
function zonedDayStartUTC(year: number, month: number, day: number, timezone: string): Date {
  const utcApprox = Date.UTC(year, month, day);
  return new Date(utcApprox - zoneOffsetMillis(new Date(utcApprox), timezone));
}

export function isOpenAt(store: { operatingHours?: unknown; timezone?: string | null }, instant: Date): boolean {
  const hours = hoursOrAlwaysOpen(store);
  if (hours.length === 0) return true;
  const timezone = store.timezone || DEFAULT_TIMEZONE;
  const parts = zonedParts(instant, timezone);
  const day = hours.find((entry) => entry.dayOfWeek === parts.dayOfWeek);
  if (!day) return false;
  return day.windows.some((window) =>
    window.closeMinute > window.openMinute
      ? parts.minuteOfDay >= window.openMinute && parts.minuteOfDay < window.closeMinute
      : parts.minuteOfDay >= window.openMinute || parts.minuteOfDay < window.closeMinute,
  );
}

/**
 * Earliest future instant when the store is open, scanning up to 8 calendar days.
 * Returns `from` itself when the store is open at `from`; null if no open window is found.
 */
export function nextOpenAt(store: { operatingHours?: unknown; timezone?: string | null }, from: Date): Date | null {
  const hours = hoursOrAlwaysOpen(store);
  if (hours.length === 0) return from;
  if (isOpenAt(store, from)) return from;
  const timezone = store.timezone || DEFAULT_TIMEZONE;
  const base = zonedParts(from, timezone);
  for (let offset = 0; offset <= 8; offset += 1) {
    const cursor = new Date(
      zonedDayStartUTC(base.year, base.month, base.day, timezone).getTime() +
        offset * 86_400_000,
    );
    const day = hours.find((entry) => entry.dayOfWeek === zonedParts(cursor, timezone).dayOfWeek);
    if (!day) continue;
    for (const window of day.windows) {
      const openInstant = new Date(cursor.getTime() + window.openMinute * 60_000);
      if (openInstant.getTime() >= from.getTime()) return openInstant;
    }
  }
  return null;
}

/** True when the whole [start, end) delivery window falls inside operating hours. */
export function windowWithinOpenHours(
  store: { operatingHours?: unknown; timezone?: string | null },
  start: Date,
  end: Date,
): boolean {
  const hours = hoursOrAlwaysOpen(store);
  if (hours.length === 0) return true;
  for (let t = start.getTime(); t < end.getTime(); t += 60_000) {
    if (!isOpenAt(store, new Date(t))) return false;
  }
  return true;
}

export function minutesToLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export const OPERATING_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface ZonedCalendarDate {
  year: number;
  month: number; // 0-based
  day: number;
}

export function zonedCalendarDate(instant: Date, timezone: string): ZonedCalendarDate {
  const parts = zonedParts(instant, timezone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** Absolute instant for a minute-of-day on a zoned calendar day (with optional day offset). */
export function zonedSlotInstant(
  date: ZonedCalendarDate,
  dayOffset: number,
  minuteOfDay: number,
  timezone: string,
): Date {
  const dayStart = zonedDayStartUTC(date.year, date.month, date.day + dayOffset, timezone);
  return new Date(dayStart.getTime() + minuteOfDay * 60_000);
}

export function formatInstantInZone(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(instant);
}