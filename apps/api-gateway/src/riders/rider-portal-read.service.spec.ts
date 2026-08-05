import { BadRequestException, ConflictException } from '@nestjs/common';
import { RiderPortalReadService } from './rider-portal-read.service';

describe('RiderPortalReadService schedule validation', () => {
  const service = new RiderPortalReadService({} as any);

  it('accepts multiple non-overlapping windows on the same day', () => {
    expect(() => service.assertSchedule([
      { dayOfWeek: 1, startMinute: 540, endMinute: 720, isAvailable: true },
      { dayOfWeek: 1, startMinute: 780, endMinute: 1020, isAvailable: true },
      { dayOfWeek: 2, startMinute: 600, endMinute: 900, isAvailable: true },
    ])).not.toThrow();
  });

  it('rejects overlapping Rider work windows', () => {
    expect(() => service.assertSchedule([
      { dayOfWeek: 3, startMinute: 540, endMinute: 780, isAvailable: true },
      { dayOfWeek: 3, startMinute: 720, endMinute: 900, isAvailable: true },
    ])).toThrow(ConflictException);
  });

  it('rejects a window whose start is not before its end', () => {
    expect(() => service.assertSchedule([
      { dayOfWeek: 4, startMinute: 900, endMinute: 900, isAvailable: true },
    ])).toThrow(BadRequestException);
  });

  it('publishes the configured schedule timezone', () => {
    const previous = process.env.RIDER_TIMEZONE;
    process.env.RIDER_TIMEZONE = 'Asia/Kolkata';
    expect(service.availabilityMetadata()).toEqual({
      timezone: 'Asia/Kolkata',
      timezoneSource: 'CONFIGURED',
      supportsMultipleWindows: true,
      maxWindows: 28,
    });
    if (previous === undefined) delete process.env.RIDER_TIMEZONE;
    else process.env.RIDER_TIMEZONE = previous;
  });
});
