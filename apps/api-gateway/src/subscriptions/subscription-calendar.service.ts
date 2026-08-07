import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionDeliveryFrequency } from '@aagam/database';
import {
  DEFAULT_DELIVERY_TIMEZONE,
  formatWindowMetadata,
  todayInTimezone,
  zonedServiceWindow,
} from './subscription-timezone';

type CalendarPlan = {
  deliveryFrequency: SubscriptionDeliveryFrequency;
  selectedWeekdays?: number[] | null;
  customSchedule?: unknown;
  durationDays: number;
  totalDeliveries: number;
};

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

/**
 * `serviceDate` is a date-only business anchor encoded at UTC midnight. The
 * delivery instant itself is created in the resolved zone's IANA timezone.
 * Keeping the date anchor stable preserves existing uniqueness/index semantics
 * while avoiding device/server-timezone drift.
 */
export function serviceWindow(
  serviceDate: Date,
  startMinute: number,
  endMinute: number,
  timezone = DEFAULT_DELIVERY_TIMEZONE,
) {
  const { start, end } = zonedServiceWindow(serviceDate, startMinute, endMinute, timezone);
  return { start, end };
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

  validateStartDate(startDate: Date | string, timezone: string, now = new Date()) {
    const start = startOfUtcDay(startDate);
    const today = todayInTimezone(timezone, now);
    if (start < today) throw new BadRequestException('Subscription start date cannot be in the past');
    if (start > addUtcDays(today, 90)) throw new BadRequestException('Subscription start date is too far in the future');
    return start;
  }

  window(serviceDate: Date, startMinute: number, endMinute: number, timezone: string) {
    return zonedServiceWindow(serviceDate, startMinute, endMinute, timezone);
  }

  windowMetadata(serviceDate: Date, startMinute: number, endMinute: number, timezone: string) {
    return formatWindowMetadata(serviceDate, startMinute, endMinute, timezone);
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
