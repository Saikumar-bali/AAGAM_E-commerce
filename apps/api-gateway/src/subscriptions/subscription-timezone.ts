import { BadRequestException } from '@nestjs/common';

export const DEFAULT_DELIVERY_TIMEZONE = 'Asia/Kolkata';

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsFor(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

export function validateIanaTimezone(timezone?: string | null) {
  const candidate = String(timezone || '').trim();
  if (!candidate) throw new BadRequestException('Delivery-zone timezone is required');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0));
  } catch {
    throw new BadRequestException(`Invalid IANA timezone: ${candidate}`);
  }
  return candidate;
}

function timezoneOffsetMs(instant: Date, timezone: string) {
  const parts = partsFor(instant, timezone);
  const renderedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return renderedAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function addLocalDays(parts: Pick<LocalParts, 'year' | 'month' | 'day'>, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localMinuteParts(serviceDate: Date, minuteOfDay: number, dayOffset = 0) {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1440) {
    throw new BadRequestException('Delivery-window minute is invalid');
  }
  const base = {
    year: serviceDate.getUTCFullYear(),
    month: serviceDate.getUTCMonth() + 1,
    day: serviceDate.getUTCDate(),
  };
  const overflow = minuteOfDay === 1440 ? 1 : 0;
  const localDate = addLocalDays(base, dayOffset + overflow);
  const normalizedMinute = minuteOfDay === 1440 ? 0 : minuteOfDay;
  return {
    ...localDate,
    hour: Math.floor(normalizedMinute / 60),
    minute: normalizedMinute % 60,
    second: 0,
  };
}

export function zonedLocalToUtc(local: LocalParts, timezone: string) {
  const zone = validateIanaTimezone(timezone);
  const naiveUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  let candidateMs = naiveUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const offset = timezoneOffsetMs(new Date(candidateMs), zone);
    const next = naiveUtc - offset;
    if (next === candidateMs) break;
    candidateMs = next;
  }
  const candidate = new Date(candidateMs);
  const rendered = partsFor(candidate, zone);
  if (
    rendered.year !== local.year
    || rendered.month !== local.month
    || rendered.day !== local.day
    || rendered.hour !== local.hour
    || rendered.minute !== local.minute
  ) {
    throw new BadRequestException(`Delivery window falls in a non-existent local time in ${zone}`);
  }
  return candidate;
}

export function zonedServiceWindow(
  serviceDate: Date,
  startMinute: number,
  endMinute: number,
  timezone = DEFAULT_DELIVERY_TIMEZONE,
) {
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
    throw new BadRequestException('Delivery-window start is invalid');
  }
  if (!Number.isInteger(endMinute) || endMinute < 1 || endMinute > 1440) {
    throw new BadRequestException('Delivery-window end is invalid');
  }
  if (endMinute === startMinute) throw new BadRequestException('Delivery window is invalid');
  const zone = validateIanaTimezone(timezone);
  const endNextDay = endMinute < startMinute && endMinute !== 1440;
  const start = zonedLocalToUtc(localMinuteParts(serviceDate, startMinute), zone);
  const end = zonedLocalToUtc(localMinuteParts(serviceDate, endMinute, endNextDay ? 1 : 0), zone);
  if (end <= start) throw new BadRequestException('Delivery window must have a positive duration');
  return { start, end, timezone: zone, crossesMidnight: endNextDay };
}

export function serviceDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid service date');
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function todayInTimezone(timezone: string, now = new Date()) {
  const zone = validateIanaTimezone(timezone);
  const parts = partsFor(now, zone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function formatWindowMetadata(
  serviceDate: Date,
  startMinute: number,
  endMinute: number,
  timezone: string,
) {
  const window = zonedServiceWindow(serviceDate, startMinute, endMinute, timezone);
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: window.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const zoneFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: window.timezone,
    timeZoneName: 'short',
  });
  const zoneName = zoneFormatter.formatToParts(window.start).find((part) => part.type === 'timeZoneName')?.value || window.timezone;
  const localStartLabel = formatter.format(window.start);
  const localEndLabel = formatter.format(window.end);
  return {
    timezone: window.timezone,
    serviceDate: serviceDateKey(serviceDate),
    localStartLabel,
    localEndLabel,
    localWindowLabel: `${localStartLabel} – ${localEndLabel} ${zoneName}`,
    utcStart: window.start,
    utcEnd: window.end,
    crossesMidnight: window.crossesMidnight,
  };
}
