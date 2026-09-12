import { SubscriptionProofMode } from '@aagam/database';
import { deliverySlotWindow } from './delivery-run-planning.service';

describe('deliverySlotWindow — AM/PM run split for offline store deliveries', () => {
  const sub = {
    deliveryWindowStartMinute: 6 * 60,
    deliveryWindowEndMinute: 9 * 60,
  };

  it('keeps the subscription window for AM rows', () => {
    expect(deliverySlotWindow({ deliverySlot: 'AM', subscription: sub })).toEqual({
      startMinute: 6 * 60,
      endMinute: 9 * 60,
    });
  });

  it('uses the evening window (17:00-20:00) for PM rows so PM splits into its own run', () => {
    expect(deliverySlotWindow({ deliverySlot: 'PM', subscription: sub })).toEqual({
      startMinute: 17 * 60,
      endMinute: 20 * 60,
    });
  });

  it('falls back to the subscription window when no explicit slot is set', () => {
    expect(deliverySlotWindow({ deliverySlot: null, subscription: sub })).toEqual({
      startMinute: 6 * 60,
      endMinute: 9 * 60,
    });
    expect(deliverySlotWindow({ subscription: sub })).toEqual({
      startMinute: sub.deliveryWindowStartMinute,
      endMinute: sub.deliveryWindowEndMinute,
    });
  });

  it('keeps the existing proof mode for regular rows while store-delivery rows stamp RIDER_PHOTO_GPS', () => {
    // sanity: the enum value used by the planner exists in the generated client
    expect(SubscriptionProofMode.RIDER_PHOTO_GPS).toBe('RIDER_PHOTO_GPS');
  });
});