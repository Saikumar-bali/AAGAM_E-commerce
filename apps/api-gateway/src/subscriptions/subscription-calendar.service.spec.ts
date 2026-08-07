import { SubscriptionDeliveryFrequency } from '@aagam/database';
import { SubscriptionCalendarService, serviceWindow } from './subscription-calendar.service';

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

  it('creates timezone-correct same-day and overnight windows', () => {
    expect(serviceWindow(new Date('2026-08-10T00:00:00.000Z'), 360, 540, 'Asia/Kolkata')).toEqual({
      start: new Date('2026-08-10T00:30:00.000Z'),
      end: new Date('2026-08-10T03:30:00.000Z'),
    });
    expect(serviceWindow(new Date('2026-08-10T00:00:00.000Z'), 1320, 360, 'Asia/Kolkata')).toEqual({
      start: new Date('2026-08-10T16:30:00.000Z'),
      end: new Date('2026-08-11T00:30:00.000Z'),
    });
    expect(() => serviceWindow(new Date('2026-08-10T00:00:00.000Z'), 540, 540, 'Asia/Kolkata')).toThrow('Delivery window is invalid');
    expect(() => service.buildServiceDates(plan(SubscriptionDeliveryFrequency.SELECTED_WEEKDAYS), '2026-08-10', 1)).toThrow('at least one weekday');
  });

  it('honours IANA DST offsets rather than a fixed server offset', () => {
    expect(serviceWindow(new Date('2026-01-15T00:00:00.000Z'), 360, 540, 'America/New_York').start).toEqual(new Date('2026-01-15T11:00:00.000Z'));
    expect(serviceWindow(new Date('2026-07-15T00:00:00.000Z'), 360, 540, 'America/New_York').start).toEqual(new Date('2026-07-15T10:00:00.000Z'));
  });
});
