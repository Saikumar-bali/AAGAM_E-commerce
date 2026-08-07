from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text()

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)

def replace(path: str, old: str, new: str, count: int = 1) -> None:
    content = read(path)
    actual = content.count(old)
    if actual < count:
        raise RuntimeError(f"Expected at least {count} matches in {path}, found {actual}: {old[:120]!r}")
    write(path, content.replace(old, new, count))

def regex_replace(path: str, pattern: str, replacement: str, count: int = 1, flags: int = 0) -> None:
    content = read(path)
    updated, actual = re.subn(pattern, replacement, content, count=count, flags=flags)
    if actual != count:
        raise RuntimeError(f"Expected {count} regex matches in {path}, found {actual}: {pattern[:120]!r}")
    write(path, updated)

# ---------------------------------------------------------------------------
# Prisma: authoritative IANA timezone for every delivery zone.
# ---------------------------------------------------------------------------
replace(
    "packages/database/prisma/schema.prisma",
    "  description                      String?\n  isActive                         Boolean  @default(true)",
    "  description                      String?\n  timezone                         String   @default(\"Asia/Kolkata\")\n  isActive                         Boolean  @default(true)",
)
write(
    "packages/database/prisma/migrations/20260807003000_subscription_timezone_serviceability/migration.sql",
    """-- Backward-compatible timezone source of truth for subscription delivery windows.\nALTER TABLE \"DeliveryZone\"\n  ADD COLUMN IF NOT EXISTS \"timezone\" TEXT NOT NULL DEFAULT 'Asia/Kolkata';\n\nUPDATE \"DeliveryZone\"\nSET \"timezone\" = 'Asia/Kolkata'\nWHERE \"timezone\" IS NULL OR BTRIM(\"timezone\") = '';\n""",
)

# ---------------------------------------------------------------------------
# Timezone-safe calendar/window helpers. Uses Intl/IANA rules, including DST.
# ---------------------------------------------------------------------------
write(
    "apps/api-gateway/src/subscriptions/subscription-calendar.service.ts",
    r"""import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionDeliveryFrequency } from '@aagam/database';

type CalendarPlan = {
  deliveryFrequency: SubscriptionDeliveryFrequency;
  selectedWeekdays?: number[] | null;
  customSchedule?: unknown;
  durationDays: number;
  totalDeliveries: number;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

export function assertIanaTimezone(timezone: string | null | undefined) {
  const value = String(timezone || '').trim();
  if (!value) throw new BadRequestException('Delivery-zone timezone is required');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
  } catch {
    throw new BadRequestException(`Invalid IANA timezone: ${value}`);
  }
  return value;
}

function formatterFor(timezone: string) {
  const validated = assertIanaTimezone(timezone);
  const existing = partsFormatters.get(validated);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: validated,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  partsFormatters.set(validated, formatter);
  return formatter;
}

function zonedParts(value: Date, timezone: string): ZonedParts {
  const values = Object.fromEntries(
    formatterFor(timezone).formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function dateKey(value: Date | string) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid service date');
  return date.toISOString().slice(0, 10);
}

function localTarget(serviceDate: Date | string, absoluteMinute: number) {
  const [year, month, day] = dateKey(serviceDate).split('-').map(Number);
  const dayOffset = Math.floor(absoluteMinute / 1440);
  const minuteOfDay = ((absoluteMinute % 1440) + 1440) % 1440;
  const target = new Date(Date.UTC(year, month - 1, day + dayOffset, Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0));
  return {
    epochLikeUtc: target.getTime(),
    expected: {
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
      hour: target.getUTCHours(),
      minute: target.getUTCMinutes(),
      second: 0,
    },
  };
}

export function zonedDateTimeToUtc(serviceDate: Date | string, absoluteMinute: number, timezone = DEFAULT_TIMEZONE) {
  const zone = assertIanaTimezone(timezone);
  if (!Number.isInteger(absoluteMinute) || absoluteMinute < 0 || absoluteMinute > 2880) {
    throw new BadRequestException('Delivery window minute is invalid');
  }
  const { epochLikeUtc, expected } = localTarget(serviceDate, absoluteMinute);
  let candidate = epochLikeUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = zonedParts(new Date(candidate), zone);
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
    const next = epochLikeUtc - (representedAsUtc - candidate);
    if (next === candidate) break;
    candidate = next;
  }
  const result = new Date(candidate);
  const roundTrip = zonedParts(result, zone);
  if (
    roundTrip.year !== expected.year
    || roundTrip.month !== expected.month
    || roundTrip.day !== expected.day
    || roundTrip.hour !== expected.hour
    || roundTrip.minute !== expected.minute
  ) {
    throw new BadRequestException('Delivery window falls in an invalid local timezone transition');
  }
  return result;
}

export function formatZonedTime(value: Date | string, timezone = DEFAULT_TIMEZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid delivery time');
  const zone = assertIanaTimezone(timezone);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date).replace(/\s+/g, ' ').trim();
}

export function startOfUtcDay(value: Date | string) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid service date');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(value: Date, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return startOfUtcDay(date);
}

export function serviceWindow(
  serviceDate: Date | string,
  startMinute: number,
  endMinute: number,
  timezone = DEFAULT_TIMEZONE,
) {
  if (
    !Number.isInteger(startMinute)
    || !Number.isInteger(endMinute)
    || startMinute < 0
    || startMinute > 1439
    || endMinute < 1
    || endMinute > 1440
    || endMinute === startMinute
  ) {
    throw new BadRequestException('Delivery window is invalid');
  }
  const zone = assertIanaTimezone(timezone);
  const absoluteEndMinute = endMinute <= startMinute ? endMinute + 1440 : endMinute;
  const start = zonedDateTimeToUtc(serviceDate, startMinute, zone);
  const end = zonedDateTimeToUtc(serviceDate, absoluteEndMinute, zone);
  if (end <= start) throw new BadRequestException('Delivery window is invalid');
  const startLabel = formatZonedTime(start, zone);
  const endLabel = formatZonedTime(end, zone);
  const abbreviation = endLabel.split(' ').at(-1) || zone;
  const localStartLabel = startLabel.replace(new RegExp(`\\s+${abbreviation.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`), '');
  const localEndLabel = endLabel.replace(new RegExp(`\\s+${abbreviation.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`), '');
  return {
    start,
    end,
    timezone: zone,
    localDate: dateKey(serviceDate),
    localStartLabel,
    localEndLabel,
    label: `${localStartLabel} – ${localEndLabel} ${abbreviation}`,
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
  };
}

function selectedDays(plan: CalendarPlan) {
  const days = [...new Set(plan.selectedWeekdays ?? [])].sort();
  if (plan.deliveryFrequency === SubscriptionDeliveryFrequency.SELECTED_WEEKDAYS && days.length === 0) {
    throw new BadRequestException('Selected-weekday plans require at least one weekday');
  }
  return days;
}

function isServiceDate(plan: CalendarPlan, candidate: Date, start: Date, accepted: number) {
  const offset = Math.round((candidate.getTime() - start.getTime()) / 86_400_000);
  switch (plan.deliveryFrequency) {
    case SubscriptionDeliveryFrequency.DAILY:
      return true;
    case SubscriptionDeliveryFrequency.ALTERNATE_DAYS:
      return offset % 2 === 0;
    case SubscriptionDeliveryFrequency.WEEKDAYS: {
      const day = candidate.getUTCDay();
      return day >= 1 && day <= 5;
    }
    case SubscriptionDeliveryFrequency.SELECTED_WEEKDAYS:
      return selectedDays(plan).includes(candidate.getUTCDay());
    case SubscriptionDeliveryFrequency.WEEKLY:
      return offset % 7 === 0;
    case SubscriptionDeliveryFrequency.CUSTOM: {
      const custom = (plan.customSchedule ?? {}) as Record<string, unknown>;
      const explicit = Array.isArray(custom.weekdays)
        ? custom.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
        : [];
      if (explicit.length > 0) return explicit.includes(candidate.getUTCDay());
      const intervalDays = Number(custom.intervalDays || 1);
      if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 366) {
        throw new BadRequestException('CUSTOM frequency requires valid weekdays or intervalDays');
      }
      return offset % intervalDays === 0 && accepted < plan.totalDeliveries;
    }
    default:
      return false;
  }
}

@Injectable()
export class SubscriptionCalendarService {
  buildServiceDates(plan: CalendarPlan, startDate: Date | string, count = plan.totalDeliveries) {
    if (!Number.isInteger(count) || count < 1 || count > 366) {
      throw new BadRequestException('Delivery count must be between 1 and 366');
    }
    const start = startOfUtcDay(startDate);
    const dates: Date[] = [];
    let candidate = start;
    const hardLimit = Math.max(plan.durationDays + count * 14, 4000);
    for (let scanned = 0; dates.length < count && scanned < hardLimit; scanned += 1) {
      if (isServiceDate(plan, candidate, start, dates.length)) dates.push(candidate);
      candidate = addUtcDays(candidate, 1);
    }
    if (dates.length !== count) {
      throw new BadRequestException('Plan schedule cannot produce the configured delivery count');
    }
    return dates;
  }

  nextAfter(plan: CalendarPlan, afterDate: Date | string, anchorDate: Date | string) {
    const anchor = startOfUtcDay(anchorDate);
    let candidate = addUtcDays(startOfUtcDay(afterDate), 1);
    for (let scanned = 0; scanned < 4000; scanned += 1) {
      if (isServiceDate(plan, candidate, anchor, 0)) return candidate;
      candidate = addUtcDays(candidate, 1);
    }
    throw new BadRequestException('Unable to extend the subscription calendar');
  }

  occurrenceAmount(totalPricePaise: number, totalDeliveries: number, sequenceNumber: number) {
    if (!Number.isSafeInteger(totalPricePaise) || totalPricePaise < 0) {
      throw new BadRequestException('Plan price must be an integer amount in paise');
    }
    if (!Number.isInteger(totalDeliveries) || totalDeliveries < 1) {
      throw new BadRequestException('Plan delivery count is invalid');
    }
    if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1 || sequenceNumber > totalDeliveries) {
      throw new BadRequestException('Subscription sequence is invalid');
    }
    const base = Math.floor(totalPricePaise / totalDeliveries);
    const remainder = totalPricePaise % totalDeliveries;
    return base + (sequenceNumber <= remainder ? 1 : 0);
  }

  fundingAmount(totalPricePaise: number, totalDeliveries: number, startsAtSequence: number, count: number) {
    let total = 0;
    const end = Math.min(totalDeliveries, startsAtSequence + count - 1);
    for (let sequence = startsAtSequence; sequence <= end; sequence += 1) {
      total += this.occurrenceAmount(totalPricePaise, totalDeliveries, sequence);
    }
    return { amountPaise: total, endsAtSequence: end, fundedDeliveryCount: Math.max(0, end - startsAtSequence + 1) };
  }
}
""",
)
write(
    "apps/api-gateway/src/subscriptions/subscription-calendar.service.spec.ts",
    r"""import { SubscriptionDeliveryFrequency } from '@aagam/database';
import {
  assertIanaTimezone,
  formatZonedTime,
  serviceWindow,
  SubscriptionCalendarService,
} from './subscription-calendar.service';

describe('SubscriptionCalendarService', () => {
  const service = new SubscriptionCalendarService();
  const plan = (deliveryFrequency: SubscriptionDeliveryFrequency, selectedWeekdays: number[] = [], customSchedule?: unknown) => ({
    deliveryFrequency,
    selectedWeekdays,
    customSchedule,
    durationDays: 30,
    totalDeliveries: 10,
  });
  const iso = (dates: Date[]) => dates.map((value) => value.toISOString().slice(0, 10));

  it('builds deterministic daily, alternate-day, weekday and weekly calendars', () => {
    expect(iso(service.buildServiceDates(plan(SubscriptionDeliveryFrequency.DAILY), '2026-08-10', 4))).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
    ]);
    expect(iso(service.buildServiceDates(plan(SubscriptionDeliveryFrequency.ALTERNATE_DAYS), '2026-08-10', 4))).toEqual([
      '2026-08-10', '2026-08-12', '2026-08-14', '2026-08-16',
    ]);
    expect(iso(service.buildServiceDates(plan(SubscriptionDeliveryFrequency.WEEKDAYS), '2026-08-14', 4))).toEqual([
      '2026-08-14', '2026-08-17', '2026-08-18', '2026-08-19',
    ]);
    expect(iso(service.buildServiceDates(plan(SubscriptionDeliveryFrequency.WEEKLY), '2026-08-10', 3))).toEqual([
      '2026-08-10', '2026-08-17', '2026-08-24',
    ]);
  });

  it('supports selected weekdays and custom interval schedules without timezone drift', () => {
    expect(iso(service.buildServiceDates(plan(SubscriptionDeliveryFrequency.SELECTED_WEEKDAYS, [1, 3, 5]), '2026-08-10', 5))).toEqual([
      '2026-08-10', '2026-08-12', '2026-08-14', '2026-08-17', '2026-08-19',
    ]);
    expect(iso(service.buildServiceDates(plan(SubscriptionDeliveryFrequency.CUSTOM, [], { intervalDays: 3 }), '2026-08-10', 4))).toEqual([
      '2026-08-10', '2026-08-13', '2026-08-16', '2026-08-19',
    ]);
  });

  it('constructs an Asia/Kolkata morning slot as UTC instants but preserves its local label', () => {
    const window = serviceWindow('2026-08-10', 360, 480, 'Asia/Kolkata');
    expect(window.start.toISOString()).toBe('2026-08-10T00:30:00.000Z');
    expect(window.end.toISOString()).toBe('2026-08-10T02:30:00.000Z');
    expect(window.label).toMatch(/^6:00\s*am – 8:00\s*am IST$/i);
    expect(formatZonedTime(window.start, 'Asia/Kolkata')).toMatch(/^6:00\s*am IST$/i);
  });

  it('uses real IANA rules for a non-India timezone and DST', () => {
    const summer = serviceWindow('2026-07-15', 360, 480, 'America/New_York');
    const winter = serviceWindow('2026-01-15', 360, 480, 'America/New_York');
    expect(summer.start.toISOString()).toBe('2026-07-15T10:00:00.000Z');
    expect(winter.start.toISOString()).toBe('2026-01-15T11:00:00.000Z');
  });

  it('supports midnight-crossing local windows', () => {
    const window = serviceWindow('2026-08-10', 1380, 60, 'Asia/Kolkata');
    expect(window.start.toISOString()).toBe('2026-08-10T17:30:00.000Z');
    expect(window.end.toISOString()).toBe('2026-08-10T19:30:00.000Z');
    expect(window.durationMinutes).toBe(120);
  });

  it('rejects invalid IANA zones and invalid windows', () => {
    expect(() => assertIanaTimezone('Mars/Olympus')).toThrow('Invalid IANA timezone');
    expect(() => serviceWindow('2026-08-10', 360, 360, 'Asia/Kolkata')).toThrow('Delivery window is invalid');
    expect(() => service.buildServiceDates(plan(SubscriptionDeliveryFrequency.SELECTED_WEEKDAYS), '2026-08-10', 1)).toThrow('at least one weekday');
  });

  it('allocates every paise exactly across occurrences and a final partial weekly funding cycle', () => {
    const occurrences = Array.from({ length: 7 }, (_, index) => service.occurrenceAmount(2_399_00, 7, index + 1));
    expect(occurrences.reduce((sum, value) => sum + value, 0)).toBe(2_399_00);
    expect(Math.max(...occurrences) - Math.min(...occurrences)).toBeLessThanOrEqual(1);
    const firstWeek = service.fundingAmount(2_399_00, 10, 1, 7);
    const finalPart = service.fundingAmount(2_399_00, 10, 8, 7);
    expect(firstWeek.fundedDeliveryCount).toBe(7);
    expect(finalPart.fundedDeliveryCount).toBe(3);
    expect(firstWeek.amountPaise + finalPart.amountPaise).toBe(2_399_00);
  });
});
""",
)

# ---------------------------------------------------------------------------
# Zone DTO/service: validate and persist IANA timezone.
# ---------------------------------------------------------------------------
replace(
    "apps/api-gateway/src/subscriptions/regional-routing.dto.ts",
    "  description?: string;\n\n  @IsOptional()\n  @IsBoolean()",
    "  description?: string;\n\n  @IsOptional()\n  @IsString()\n  @MinLength(3)\n  @MaxLength(100)\n  timezone?: string;\n\n  @IsOptional()\n  @IsBoolean()",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts",
    "import { UpsertRegionalDeliveryZoneDto } from './regional-routing.dto';",
    "import { UpsertRegionalDeliveryZoneDto } from './regional-routing.dto';\nimport { assertIanaTimezone } from './subscription-calendar.service';",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts",
    "    const code = dto.code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-');\n    if (!code) throw new BadRequestException('A valid delivery-zone code is required');",
    "    const code = dto.code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-');\n    if (!code) throw new BadRequestException('A valid delivery-zone code is required');\n    const timezone = assertIanaTimezone(dto.timezone ?? 'Asia/Kolkata');",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts",
    "        description: dto.description?.trim() || null,\n        isActive: dto.isActive ?? true,",
    "        description: dto.description?.trim() || null,\n        timezone,\n        isActive: dto.isActive ?? true,",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts",
    "  async resolve(point: GeoPoint, storeId?: string | null): Promise<ZoneResolution> {\n    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {",
    "  async resolve(point: GeoPoint, storeId?: string | null): Promise<ZoneResolution> {\n    return this.resolveWithClient(point, storeId, prisma);\n  }\n\n  async resolveWithClient(\n    point: GeoPoint,\n    storeId: string | null | undefined,\n    client: Prisma.TransactionClient | typeof prisma,\n  ): Promise<ZoneResolution> {\n    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts",
    "    const zones = await prisma.deliveryZone.findMany({",
    "    const zones = await client.deliveryZone.findMany({",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-delivery-zone.service.ts",
    "      name: input.zone.name,\n      source: input.source,",
    "      name: input.zone.name,\n      timezone: input.zone.timezone,\n      source: input.source,",
)

# ---------------------------------------------------------------------------
# Shared route-event endpoint: fail closed and redact non-admin payloads.
# ---------------------------------------------------------------------------
write(
    "apps/api-gateway/src/subscriptions/regional-route-event-access.service.ts",
    r"""import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@aagam/database';
import { RegionalRouteOperationsService } from './regional-route-operations.service';
import type { RegionalRouteActor } from './regional-route-planning.service';

@Injectable()
export class RegionalRouteEventAccessService {
  constructor(private readonly operations: RegionalRouteOperationsService) {}

  async list(after: string | undefined, actor: RegionalRouteActor | undefined) {
    if (!actor || ![Role.ADMIN, Role.RIDER, Role.STORE_OWNER].includes(actor.role)) {
      throw new ForbiddenException('Regional route events require an authorised actor');
    }
    let normalizedAfter: string | undefined;
    if (after !== undefined) {
      const parsed = new Date(after);
      if (!after.trim() || Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid regional route event cursor');
      }
      normalizedAfter = parsed.toISOString();
    }
    const rows = await this.operations.events(normalizedAfter, actor);
    if (actor.role === Role.ADMIN) return rows;
    return rows.map((event: any) => ({
      id: event.id,
      eventType: event.eventType,
      deliveryRunId: event.deliveryRunId,
      createdAt: event.createdAt,
      payload: {
        message: typeof event.payload?.message === 'string'
          ? event.payload.message
          : 'Delivery route information was updated.',
      },
    }));
  }
}
""",
)
write(
    "apps/api-gateway/src/subscriptions/regional-route-event-access.service.spec.ts",
    r"""import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@aagam/database';
import { RegionalRouteEventAccessService } from './regional-route-event-access.service';

describe('RegionalRouteEventAccessService', () => {
  const operations = { events: jest.fn() };
  const service = new RegionalRouteEventAccessService(operations as any);

  beforeEach(() => operations.events.mockReset());

  it('fails closed for a missing or unsupported actor', async () => {
    await expect(service.list(undefined, undefined)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(undefined, { id: 'customer-a', role: Role.CUSTOMER })).rejects.toBeInstanceOf(ForbiddenException);
    expect(operations.events).not.toHaveBeenCalled();
  });

  it('rejects an invalid cursor instead of returning an unbounded feed', async () => {
    await expect(service.list('not-a-date', { id: 'admin-a', role: Role.ADMIN })).rejects.toBeInstanceOf(BadRequestException);
    expect(operations.events).not.toHaveBeenCalled();
  });

  it('passes the exact rider actor and strips stop/movement payload data', async () => {
    operations.events.mockResolvedValue([{ id: 'event-a', eventType: 'RUN_STOP_MOVED', deliveryRunId: 'run-a', deliveryRunStopId: 'stop-a', createdAt: new Date('2026-08-07T00:00:00Z'), payload: { message: 'Refresh.', coordinates: [1, 2], sourceRunId: 'run-b' } }]);
    const result = await service.list(undefined, { id: 'rider-user-a', role: Role.RIDER });
    expect(operations.events).toHaveBeenCalledWith(undefined, { id: 'rider-user-a', role: Role.RIDER });
    expect(result).toEqual([{ id: 'event-a', eventType: 'RUN_STOP_MOVED', deliveryRunId: 'run-a', createdAt: new Date('2026-08-07T00:00:00Z'), payload: { message: 'Refresh.' } }]);
    expect(JSON.stringify(result)).not.toContain('stop-a');
    expect(JSON.stringify(result)).not.toContain('run-b');
    expect(JSON.stringify(result)).not.toContain('coordinates');
  });

  it('keeps Rider A and Store A scoped independently from Rider B and Store B', async () => {
    operations.events
      .mockResolvedValueOnce([{ id: 'rider-a-event', eventType: 'DELIVERY_RUN_ASSIGNED', deliveryRunId: 'run-rider-a', createdAt: new Date(), payload: { message: 'Assigned.' } }])
      .mockResolvedValueOnce([{ id: 'store-a-event', eventType: 'ROUTE_CLUSTER_CREATED', deliveryRunId: 'run-store-a', createdAt: new Date(), payload: { message: 'Updated.' } }]);
    const riderA = await service.list(undefined, { id: 'rider-user-a', role: Role.RIDER });
    const storeA = await service.list(undefined, { id: 'store-owner-a', role: Role.STORE_OWNER });
    expect(riderA.map((row) => row.deliveryRunId)).toEqual(['run-rider-a']);
    expect(storeA.map((row) => row.deliveryRunId)).toEqual(['run-store-a']);
    expect(operations.events.mock.calls).toEqual([
      [undefined, { id: 'rider-user-a', role: Role.RIDER }],
      [undefined, { id: 'store-owner-a', role: Role.STORE_OWNER }],
    ]);
  });

  it('allows an admin to receive the full authorised event feed', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    operations.events.mockResolvedValue(rows);
    await expect(service.list('2026-08-07T00:00:00.000Z', { id: 'admin-a', role: Role.ADMIN })).resolves.toBe(rows);
    expect(operations.events).toHaveBeenCalledWith('2026-08-07T00:00:00.000Z', { id: 'admin-a', role: Role.ADMIN });
  });
});
""",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-routing.controller.ts",
    "import { RegionalRouteOperationsService } from './regional-route-operations.service';",
    "import { RegionalRouteOperationsService } from './regional-route-operations.service';\nimport { RegionalRouteEventAccessService } from './regional-route-event-access.service';",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-routing.controller.ts",
    "export class RegionalRoutingEventsController {\n  constructor(private readonly operations: RegionalRouteOperationsService) {}",
    "export class RegionalRoutingEventsController {\n  constructor(private readonly events: RegionalRouteEventAccessService) {}",
)
replace(
    "apps/api-gateway/src/subscriptions/regional-routing.controller.ts",
    "    return this.operations.events(after, request.user);",
    "    return this.events.list(after, request.user);",
)

# ---------------------------------------------------------------------------
# Reusable quote/create/generation serviceability gate.
# ---------------------------------------------------------------------------
write(
    "apps/api-gateway/src/subscriptions/subscription-serviceability.service.ts",
    r"""import { ConflictException, Injectable } from '@nestjs/common';
import {
  Prisma,
  SubscriptionDeliveryStatus,
  prisma,
} from '@aagam/database';
import { calculateDistance } from '@aagam/utils';
import { addUtcDays, serviceWindow, startOfUtcDay } from './subscription-calendar.service';
import { RegionalDeliveryZoneService } from './regional-delivery-zone.service';

type DatabaseClient = Prisma.TransactionClient | typeof prisma;
type PlanInput = {
  id: string;
  items: Array<{ productId: string; quantityPerDelivery: number; product?: { name?: string | null } }>;
  stores: Array<{ storeId: string }>;
  zones: Array<{ zoneId: string }>;
};
type AddressInput = { id?: string; latitude: number; longitude: number };

type DeliverySlot = { startMinute: number; endMinute: number };

export class SubscriptionServiceabilityError extends ConflictException {
  constructor(public readonly code: string, message: string) {
    super({ statusCode: 409, error: 'SubscriptionServiceabilityError', code, message });
  }
}

function slotRange(startMinute: number, endMinute: number) {
  return { start: startMinute, end: endMinute <= startMinute ? endMinute + 1440 : endMinute };
}

function parsedSlots(value: Prisma.JsonValue | null): DeliverySlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, Prisma.JsonValue>;
    const startMinute = Number(row.startMinute);
    const endMinute = Number(row.endMinute);
    return Number.isInteger(startMinute) && Number.isInteger(endMinute)
      ? [{ startMinute, endMinute }]
      : [];
  });
}

@Injectable()
export class SubscriptionServiceabilityService {
  constructor(private readonly zones: RegionalDeliveryZoneService) {}

  async resolve(input: {
    plan: PlanInput;
    address: AddressInput;
    serviceDates: Date[];
    windowStartMinute: number;
    windowEndMinute: number;
    client?: DatabaseClient;
    excludeSubscriptionDeliveryId?: string;
  }) {
    const db = input.client ?? prisma;
    const point = { latitude: Number(input.address.latitude), longitude: Number(input.address.longitude) };
    const resolution = await this.zones.resolveWithClient(point, undefined, db);
    if (!resolution.zone) {
      throw new SubscriptionServiceabilityError('OUTSIDE_ACTIVE_ZONE', resolution.reason || 'Address is outside an active delivery zone');
    }
    const zone = resolution.zone;
    if (input.plan.zones.length && !input.plan.zones.some((entry) => entry.zoneId === zone.id)) {
      throw new SubscriptionServiceabilityError('PLAN_NOT_AVAILABLE_IN_ZONE', `This subscription plan is not available in ${zone.name}`);
    }

    const explicitStoreIds = [...new Set(input.plan.stores.map((entry) => entry.storeId))];
    const zoneStoreIds = zone.storeLinks.map((entry) => entry.storeId);
    const permittedStoreIds = explicitStoreIds.length
      ? explicitStoreIds.filter((id) => !zoneStoreIds.length || zoneStoreIds.includes(id))
      : zoneStoreIds;
    const stores = await db.store.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(permittedStoreIds.length ? { id: { in: permittedStoreIds } } : {}),
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    if (!stores.length || (explicitStoreIds.length && !permittedStoreIds.length)) {
      throw new SubscriptionServiceabilityError('NO_CAPABLE_STORE', 'No active store serves this plan and delivery zone');
    }
    const serviceableStores = stores.map((store) => ({
      store,
      distanceKm: calculateDistance(point.latitude, point.longitude, store.latitude, store.longitude),
    })).filter((entry) => entry.distanceKm <= zone.maximumRouteDistanceKm)
      .sort((left, right) => left.distanceKm - right.distanceKm || left.store.id.localeCompare(right.store.id));
    if (!serviceableStores.length) {
      throw new SubscriptionServiceabilityError('STORE_OUTSIDE_SERVICE_DISTANCE', 'No applicable store is within the zone service distance');
    }

    const inventoryRows = await db.inventory.findMany({
      where: {
        storeId: { in: serviceableStores.map((entry) => entry.store.id) },
        productId: { in: input.plan.items.map((item) => item.productId) },
      },
      select: { storeId: true, productId: true, quantity: true, isListed: true },
    });
    const inventoryByStore = new Map<string, Map<string, { quantity: number; isListed: boolean }>>();
    for (const row of inventoryRows) {
      if (!inventoryByStore.has(row.storeId)) inventoryByStore.set(row.storeId, new Map());
      inventoryByStore.get(row.storeId)!.set(row.productId, { quantity: row.quantity, isListed: row.isListed });
    }
    const inventoryFailures: string[] = [];
    const selectedStore = serviceableStores.find(({ store }) => input.plan.items.every((item) => {
      const inventory = inventoryByStore.get(store.id)?.get(item.productId);
      return Boolean(inventory?.isListed && inventory.quantity >= item.quantityPerDelivery);
    }));
    if (!selectedStore) {
      for (const item of input.plan.items) {
        const best = serviceableStores.map(({ store }) => inventoryByStore.get(store.id)?.get(item.productId)).find(Boolean);
        if (!best?.isListed) inventoryFailures.push(`${item.product?.name || item.productId}: unavailable`);
        else if (best.quantity < item.quantityPerDelivery) inventoryFailures.push(`${item.product?.name || item.productId}: insufficient stock`);
      }
      throw new SubscriptionServiceabilityError('INITIAL_INVENTORY_UNAVAILABLE', inventoryFailures.join('; ') || 'Initial subscription inventory is unavailable');
    }

    const requestedRange = slotRange(input.windowStartMinute, input.windowEndMinute);
    const slots = parsedSlots(zone.deliverySlots);
    if (slots.length && !slots.some((slot) => {
      const allowed = slotRange(slot.startMinute, slot.endMinute);
      return requestedRange.start >= allowed.start && requestedRange.end <= allowed.end;
    })) {
      throw new SubscriptionServiceabilityError('WINDOW_NOT_IN_ZONE_SLOT', 'Requested delivery window is outside the active zone slots');
    }
    const windowMinutes = requestedRange.end - requestedRange.start;
    const routeMinutesAvailable = windowMinutes - zone.slotEndBufferMinutes;
    if (routeMinutesAvailable < 1 || zone.maximumEstimatedDurationMinutes > routeMinutesAvailable) {
      throw new SubscriptionServiceabilityError(
        'SLOT_END_BUFFER_BREACH',
        `Delivery window cannot fit the route duration and ${zone.slotEndBufferMinutes}-minute slot buffer`,
      );
    }
    const firstWindow = serviceWindow(
      input.serviceDates[0],
      input.windowStartMinute,
      input.windowEndMinute,
      zone.timezone,
    );

    const checkedDates: Array<{ localDate: string; existingDemand: number; capacity: number }> = [];
    for (const serviceDate of input.serviceDates) {
      const from = startOfUtcDay(serviceDate);
      const to = addUtcDays(from, 1);
      const [deliveries, stops] = await Promise.all([
        db.subscriptionDelivery.findMany({
          where: {
            ...(input.excludeSubscriptionDeliveryId ? { id: { not: input.excludeSubscriptionDeliveryId } } : {}),
            deliveryZoneId: zone.id,
            serviceDate: { gte: from, lt: to },
            status: { notIn: [SubscriptionDeliveryStatus.CANCELLED, SubscriptionDeliveryStatus.SKIPPED] },
          },
          select: { id: true },
        }),
        db.deliveryRunStop.findMany({
          where: {
            deliveryZoneId: zone.id,
            subscriptionDelivery: {
              ...(input.excludeSubscriptionDeliveryId ? { id: { not: input.excludeSubscriptionDeliveryId } } : {}),
              serviceDate: { gte: from, lt: to },
            },
            deliveryRun: { status: { not: 'CANCELLED' } },
          },
          select: { subscriptionDeliveryId: true },
        }),
      ]);
      const uniqueDemand = new Set([
        ...deliveries.map((row) => row.id),
        ...stops.map((row) => row.subscriptionDeliveryId),
      ]).size;
      if (uniqueDemand + 1 > zone.maximumDailySubscriptionCapacity) {
        throw new SubscriptionServiceabilityError(
          'DAILY_CAPACITY_EXHAUSTED',
          `Daily subscription capacity is exhausted for ${from.toISOString().slice(0, 10)}`,
        );
      }
      checkedDates.push({
        localDate: from.toISOString().slice(0, 10),
        existingDemand: uniqueDemand,
        capacity: zone.maximumDailySubscriptionCapacity,
      });
    }

    return {
      zone,
      store: selectedStore.store,
      window: firstWindow,
      snapshot: {
        zoneId: zone.id,
        zoneCode: zone.code,
        timezone: zone.timezone,
        zoneResolutionSource: resolution.source,
        zoneResolutionConfidence: resolution.confidence,
        storeId: selectedStore.store.id,
        storeDistanceKm: Math.round(selectedStore.distanceKm * 100) / 100,
        checkedDates,
        capacityDecision: 'AVAILABLE',
        inventoryDecision: 'AVAILABLE',
        routeMinutesAvailable,
        window: {
          localDate: firstWindow.localDate,
          localStartLabel: firstWindow.localStartLabel,
          localEndLabel: firstWindow.localEndLabel,
          label: firstWindow.label,
          startUtc: firstWindow.start.toISOString(),
          endUtc: firstWindow.end.toISOString(),
        },
      },
    };
  }
}
""",
)
write(
    "apps/api-gateway/src/subscriptions/subscription-serviceability.service.spec.ts",
    r"""import { SubscriptionServiceabilityError, SubscriptionServiceabilityService } from './subscription-serviceability.service';

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    store: { findMany: jest.fn().mockResolvedValue([{ id: 'store-a', name: 'Store A', latitude: 17.75, longitude: 83.31 }]) },
    inventory: { findMany: jest.fn().mockResolvedValue([{ storeId: 'store-a', productId: 'milk', quantity: 20, isListed: true }]) },
    subscriptionDelivery: { findMany: jest.fn().mockResolvedValue([]) },
    deliveryRunStop: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

const zone = {
  id: 'zone-a', code: 'PM-PALEM', name: 'PM Palem', timezone: 'Asia/Kolkata',
  maximumRouteDistanceKm: 30, maximumEstimatedDurationMinutes: 90,
  maximumDailySubscriptionCapacity: 20, slotEndBufferMinutes: 15,
  deliverySlots: [{ startMinute: 360, endMinute: 480 }], storeLinks: [{ storeId: 'store-a' }],
};
const input = {
  plan: { id: 'plan-a', items: [{ productId: 'milk', quantityPerDelivery: 2, product: { name: 'Milk' } }], stores: [{ storeId: 'store-a' }], zones: [{ zoneId: 'zone-a' }] },
  address: { id: 'address-a', latitude: 17.74, longitude: 83.31 },
  serviceDates: [new Date('2026-08-10T00:00:00.000Z')],
  windowStartMinute: 360,
  windowEndMinute: 480,
};

describe('SubscriptionServiceabilityService', () => {
  it('rejects an address outside every active zone', async () => {
    const service = new SubscriptionServiceabilityService({ resolveWithClient: jest.fn().mockResolvedValue({ zone: null, source: 'UNRESOLVED', confidence: 0, reason: 'outside' }) } as any);
    await expect(service.resolve({ ...input, client: fakeDb() })).rejects.toMatchObject({ code: 'OUTSIDE_ACTIVE_ZONE' });
  });

  it('rejects plan-zone mismatch, missing inventory and exhausted capacity with typed decisions', async () => {
    const zones = { resolveWithClient: jest.fn().mockResolvedValue({ zone, source: 'POLYGON', confidence: 1 }) } as any;
    const service = new SubscriptionServiceabilityService(zones);
    await expect(service.resolve({ ...input, plan: { ...input.plan, zones: [{ zoneId: 'zone-b' }] }, client: fakeDb() })).rejects.toMatchObject({ code: 'PLAN_NOT_AVAILABLE_IN_ZONE' });
    await expect(service.resolve({ ...input, client: fakeDb({ inventory: { findMany: jest.fn().mockResolvedValue([]) } }) })).rejects.toMatchObject({ code: 'INITIAL_INVENTORY_UNAVAILABLE' });
    const full = Array.from({ length: 20 }, (_, index) => ({ id: `delivery-${index}` }));
    await expect(service.resolve({ ...input, client: fakeDb({ subscriptionDelivery: { findMany: jest.fn().mockResolvedValue(full) } }) })).rejects.toMatchObject({ code: 'DAILY_CAPACITY_EXHAUSTED' });
  });

  it('rejects a window outside zone slots and a slot buffer breach', async () => {
    const service = new SubscriptionServiceabilityService({ resolveWithClient: jest.fn().mockResolvedValue({ zone, source: 'POLYGON', confidence: 1 }) } as any);
    await expect(service.resolve({ ...input, windowStartMinute: 500, windowEndMinute: 600, client: fakeDb() })).rejects.toMatchObject({ code: 'WINDOW_NOT_IN_ZONE_SLOT' });
    await expect(service.resolve({ ...input, client: fakeDb(), windowStartMinute: 360, windowEndMinute: 420 })).rejects.toMatchObject({ code: 'SLOT_END_BUFFER_BREACH' });
  });

  it('returns a stable zone/store/timezone/inventory/capacity snapshot for a valid request', async () => {
    const service = new SubscriptionServiceabilityService({ resolveWithClient: jest.fn().mockResolvedValue({ zone, source: 'POLYGON', confidence: 1 }) } as any);
    const result = await service.resolve({ ...input, client: fakeDb() });
    expect(result.snapshot).toMatchObject({
      zoneId: 'zone-a', zoneCode: 'PM-PALEM', timezone: 'Asia/Kolkata', storeId: 'store-a',
      capacityDecision: 'AVAILABLE', inventoryDecision: 'AVAILABLE',
      window: { startUtc: '2026-08-10T00:30:00.000Z', endUtc: '2026-08-10T02:30:00.000Z' },
    });
  });
});
""",
)

# Register new services.
replace(
    "apps/api-gateway/src/subscriptions/subscriptions.module.ts",
    "import { RegionalRouteNotificationService } from './regional-route-notification.service';",
    "import { RegionalRouteNotificationService } from './regional-route-notification.service';\nimport { RegionalRouteEventAccessService } from './regional-route-event-access.service';\nimport { SubscriptionServiceabilityService } from './subscription-serviceability.service';",
)
replace(
    "apps/api-gateway/src/subscriptions/subscriptions.module.ts",
    "    RegionalRouteNotificationService,\n    SubscriptionCashFundingService,",
    "    RegionalRouteNotificationService,\n    RegionalRouteEventAccessService,\n    SubscriptionServiceabilityService,\n    SubscriptionCashFundingService,",
)
replace(
    "apps/api-gateway/src/subscriptions/subscriptions.module.ts",
    "    RegionalRouteOperationsService,\n    SubscriptionCashFundingService,",
    "    RegionalRouteOperationsService,\n    SubscriptionServiceabilityService,\n    SubscriptionCashFundingService,",
)

# Customer quote/create now resolve serviceability before acceptance.
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "import { nullableJson, requiredJson } from '../common/prisma-json';",
    "import { nullableJson, requiredJson } from '../common/prisma-json';\nimport { SubscriptionServiceabilityService } from './subscription-serviceability.service';",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "  constructor(private readonly calendar: SubscriptionCalendarService) {}",
    "  constructor(\n    private readonly calendar: SubscriptionCalendarService,\n    private readonly serviceability: SubscriptionServiceabilityService,\n  ) {}",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "    const dates = this.calendar.buildServiceDates(plan, startDate);\n    const firstFunding = this.firstFunding(plan);",
    "    const dates = this.calendar.buildServiceDates(plan, startDate);\n    const windowStart = dto.deliveryWindowStartMinute ?? plan.defaultWindowStartMinute;\n    const windowEnd = dto.deliveryWindowEndMinute ?? plan.defaultWindowEndMinute;\n    const resolution = await this.serviceability.resolve({\n      plan, address, serviceDates: dates, windowStartMinute: windowStart, windowEndMinute: windowEnd,\n    });\n    const firstFunding = this.firstFunding(plan);",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "      deliveryWindowStartMinute: dto.deliveryWindowStartMinute ?? plan.defaultWindowStartMinute,\n      deliveryWindowEndMinute: dto.deliveryWindowEndMinute ?? plan.defaultWindowEndMinute,",
    "      deliveryWindowStartMinute: windowStart,\n      deliveryWindowEndMinute: windowEnd,\n      deliveryWindow: resolution.snapshot.window,\n      timezone: resolution.snapshot.timezone,\n      serviceability: resolution.snapshot,",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "    const windowEnd = dto.deliveryWindowEndMinute ?? plan.defaultWindowEndMinute;\n    serviceWindow(startDate, windowStart, windowEnd);\n    const dates = this.calendar.buildServiceDates(plan, startDate);",
    "    const windowEnd = dto.deliveryWindowEndMinute ?? plan.defaultWindowEndMinute;\n    const dates = this.calendar.buildServiceDates(plan, startDate);",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "      if (existingAudit) return this.publicSubscription(existingAudit.subscription);\n\n      const created = await tx.customerSubscription.create({",
    "      if (existingAudit) return this.publicSubscription(existingAudit.subscription);\n\n      const resolution = await this.serviceability.resolve({\n        plan, address, serviceDates: dates, windowStartMinute: windowStart, windowEndMinute: windowEnd, client: tx,\n      });\n\n      const created = await tx.customerSubscription.create({",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "          homeStoreId: plan.stores.length === 1 ? plan.stores[0].storeId : null,\n          status:",
    "          homeStoreId: resolution.store.id,\n          deliveryZoneId: resolution.zone.id,\n          status:",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "            applicability: version.applicabilitySnapshot,\n          }, 'policySnapshot'),",
    "            applicability: version.applicabilitySnapshot,\n            serviceability: resolution.snapshot,\n          }, 'policySnapshot'),",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "              cashDuePaise: this.cashDueForSequence(plan, index + 1),\n              proofMode:",
    "              storeId: resolution.store.id,\n              deliveryZoneId: resolution.zone.id,\n              cashDuePaise: this.cashDueForSequence(plan, index + 1),\n              proofMode:",
)
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "            firstCashCollectionPaise: firstFunding.amountPaise,\n          },",
    "            firstCashCollectionPaise: firstFunding.amountPaise,\n            serviceability: resolution.snapshot,\n          },",
)
# Remove now-unused direct serviceWindow import.
replace(
    "apps/api-gateway/src/subscriptions/customer-subscription.service.ts",
    "  addUtcDays,\n  serviceWindow,\n  startOfUtcDay,",
    "  addUtcDays,\n  startOfUtcDay,",
)

# Generator revalidates the same rules inside its existing serializable lock.
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "import { isOneOf } from '../common/enum-membership';",
    "import { isOneOf } from '../common/enum-membership';\nimport { SubscriptionServiceabilityService } from './subscription-serviceability.service';",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "    private readonly calendar: SubscriptionCalendarService,\n  ) {}",
    "    private readonly calendar: SubscriptionCalendarService,\n    private readonly serviceability: SubscriptionServiceabilityService,\n  ) {}",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "                plan: true,\n                planVersion: true,",
    "                plan: true,\n                planVersion: true,\n                address: true,",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "        const store = await this.resolveStore(\n          tx,\n          subscription.addressSnapshot,\n          subscription.planVersion.applicabilitySnapshot,\n          subscription.homeStoreId,\n          itemSnapshots,\n        );",
    "        const applicability = jsonRecord(subscription.planVersion.applicabilitySnapshot);\n        const resolution = await this.serviceability.resolve({\n          plan: {\n            id: subscription.planId,\n            items: itemSnapshots.map((item) => ({\n              productId: item.productId, quantityPerDelivery: item.quantity, product: { name: item.name },\n            })),\n            stores: (Array.isArray(applicability.storeIds) ? applicability.storeIds : []).map((storeId) => ({ storeId: String(storeId) })),\n            zones: (Array.isArray(applicability.zoneIds) ? applicability.zoneIds : []).map((zoneId) => ({ zoneId: String(zoneId) })),\n          },\n          address: subscription.address,\n          serviceDates: [delivery.serviceDate],\n          windowStartMinute: subscription.deliveryWindowStartMinute,\n          windowEndMinute: subscription.deliveryWindowEndMinute,\n          client: tx,\n          excludeSubscriptionDeliveryId: delivery.id,\n        });\n        const store = resolution.store;",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "        const window = serviceWindow(\n          delivery.serviceDate,\n          subscription.deliveryWindowStartMinute,\n          subscription.deliveryWindowEndMinute,\n        );",
    "        const window = resolution.window;",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "            storeId: store.id,\n            generatedAt:",
    "            storeId: store.id,\n            deliveryZoneId: resolution.zone.id,\n            generatedAt:",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "        data: { failureReason: errorMessage(error).slice(0, 500) },",
    "        data: { failureReason: `SERVICEABILITY_DEFERRED: ${errorMessage(error)}`.slice(0, 500) },",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "      include: { subscription: { include: { plan: true } } },",
    "      include: { subscription: { include: { plan: true, deliveryZone: true } } },",
)
replace(
    "apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts",
    "        candidate.subscription.deliveryWindowEndMinute,\n      );",
    "        candidate.subscription.deliveryWindowEndMinute,\n        candidate.subscription.deliveryZone?.timezone ?? 'Asia/Kolkata',\n      );",
)

# Route planners construct slot instants in the resolved zone.
replace(
    "apps/api-gateway/src/subscriptions/regional-route-planning.service.ts",
    "        delivery.subscription.deliveryWindowEndMinute,\n      );",
    "        delivery.subscription.deliveryWindowEndMinute,\n        resolution.zone.timezone,\n      );",
)
replace(
    "apps/api-gateway/src/subscriptions/delivery-run-planning.service.ts",
    "        subscription: true,",
    "        subscription: { include: { deliveryZone: true } },",
)
replace(
    "apps/api-gateway/src/subscriptions/delivery-run-planning.service.ts",
    "        delivery.subscription.deliveryWindowEndMinute,\n      );",
    "        delivery.subscription.deliveryWindowEndMinute,\n        delivery.subscription.deliveryZone?.timezone ?? 'Asia/Kolkata',\n      );",
    count=1,
)
replace(
    "apps/api-gateway/src/subscriptions/delivery-run-planning.service.ts",
    "          first.subscription.deliveryWindowEndMinute,\n        );",
    "          first.subscription.deliveryWindowEndMinute,\n          first.subscription.deliveryZone?.timezone ?? 'Asia/Kolkata',\n        );",
)

# Partner run cards always format using server-supplied zone timezone.
replace(
    "apps/mobile-partners/src/api/subscriptionOperationsService.ts",
    "deliveryZone?: { id: string; code: string; name: string; maximumStopsPerRun?: number; cashRiskLimitPaise?: number } | null;",
    "deliveryZone?: { id: string; code: string; name: string; timezone?: string; maximumStopsPerRun?: number; cashRiskLimitPaise?: number } | null;",
)
replace(
    "apps/mobile-partners/src/screens/rider/RiderRunsScreen.tsx",
    "function time(value?: string | null) {\n  if (!value) return '—';\n  return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });\n}",
    "function time(value?: string | null, timezone = 'Asia/Kolkata') {\n  if (!value) return '—';\n  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));\n}",
)
replace(
    "apps/mobile-partners/src/screens/rider/RiderRunsScreen.tsx",
    "{time(run.slotStart)} – {time(run.slotEnd)}",
    "{time(run.slotStart, run.deliveryZone?.timezone)} – {time(run.slotEnd, run.deliveryZone?.timezone)} {run.deliveryZone?.timezone === 'Asia/Kolkata' ? 'IST' : run.deliveryZone?.timezone}",
)

# API contract regression checks.
write(
    "apps/api-gateway/src/subscription-release-hardening-phase1.contract.spec.ts",
    r"""import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('subscription release hardening phase 1 contracts', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  const controller = read('apps/api-gateway/src/subscriptions/regional-routing.controller.ts');
  const access = read('apps/api-gateway/src/subscriptions/regional-route-event-access.service.ts');
  const serviceability = read('apps/api-gateway/src/subscriptions/subscription-serviceability.service.ts');
  const customer = read('apps/api-gateway/src/subscriptions/customer-subscription.service.ts');
  const generator = read('apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts');

  it('passes authenticated actors and fails closed with redacted non-admin events', () => {
    expect(controller).toContain('return this.events.list(after, request.user)');
    expect(access).toContain("throw new ForbiddenException('Regional route events require an authorised actor')");
    expect(access).toContain("throw new BadRequestException('Invalid regional route event cursor')");
    expect(access).not.toContain('deliveryRunStopId: event.deliveryRunStopId');
  });

  it('stores an IANA timezone on delivery zones', () => {
    expect(schema).toContain('timezone                         String   @default("Asia/Kolkata")');
  });

  it('uses one quote/create/generation serviceability resolver', () => {
    expect(customer.match(/this\.serviceability\.resolve/g)?.length).toBe(2);
    expect(generator).toContain('this.serviceability.resolve');
    for (const token of ['OUTSIDE_ACTIVE_ZONE', 'PLAN_NOT_AVAILABLE_IN_ZONE', 'NO_CAPABLE_STORE', 'STORE_OUTSIDE_SERVICE_DISTANCE', 'INITIAL_INVENTORY_UNAVAILABLE', 'DAILY_CAPACITY_EXHAUSTED', 'WINDOW_NOT_IN_ZONE_SLOT', 'SLOT_END_BUFFER_BREACH']) {
      expect(serviceability).toContain(token);
    }
    expect(generator).toContain('SERVICEABILITY_DEFERRED');
  });
});
""",
)

# Grounded QA notes. Command results are appended by the workflow only after success.
write(
    "docs/qa/subscription-release-hardening/security-isolation.md",
    """# Security isolation — Phase 1\n\n- Shared `GET /regional-routing/events` now resolves through `RegionalRouteEventAccessService`.\n- Missing/unsupported actors fail closed.\n- Invalid `after` cursors return HTTP 400.\n- Rider and Store Owner calls forward the exact authenticated actor into the existing database-scoped event query.\n- Non-admin responses omit stop IDs and raw movement/recovery payloads.\n- Automated proof: `regional-route-event-access.service.spec.ts`.\n""",
)
write(
    "docs/qa/subscription-release-hardening/timezone-serviceability.md",
    """# Timezone and serviceability — Phase 1\n\n## Timezone examples\n\n- `Asia/Kolkata`, local `2026-08-10 06:00–08:00` => UTC `00:30–02:30`, displayed as `6:00 AM – 8:00 AM IST`.\n- `America/New_York`, local 06:00 uses UTC-4 in July and UTC-5 in January, proving no fixed India offset.\n- Midnight-crossing local windows are supported.\n\n## Quote/create/generation gate\n\nOne resolver verifies active zone, plan-zone applicability, active store, service distance, first-delivery inventory, forecast daily capacity, zone slot membership, and slot-end buffer. The generator re-runs the same resolver inside its serializable advisory-lock transaction and records `SERVICEABILITY_DEFERRED` on changed conditions.\n""",
)
write(
    "docs/qa/subscription-release-hardening/migration.md",
    """# Migration proof\n\n## Phase 1 migration\n\n`20260807003000_subscription_timezone_serviceability` adds non-null `DeliveryZone.timezone` with a backward-compatible `Asia/Kolkata` default and backfills blank values. Existing UTC instants remain readable; future windows are constructed from local date/minute plus the validated IANA zone.\n\nRollback is intentionally a forward-fix operation: preserve the column and correct invalid data rather than dropping timezone history after production writes begin.\n""",
)

print('Phase 1 hardening patch applied')
