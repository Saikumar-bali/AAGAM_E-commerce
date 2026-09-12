import { deliverySlotWindow } from './delivery-run-planning.service';

describe('deliverySlotWindow — AM/PM run split for offline store deliveries', () => {
  const regularSubscription = {
    isCustom: false,
    storeDelivery: false,
    deliveryWindowStartMinute: 6 * 60,
    deliveryWindowEndMinute: 9 * 60,
  };
  const customSubscription = {
    isCustom: true,
    storeDelivery: true,
    // Custom subscriptions derive their window from the FIRST schedule entry,
    // which may be PM — the row slot, not the subscription window, must win.
    deliveryWindowStartMinute: 17 * 60,
    deliveryWindowEndMinute: 20 * 60,
  };

  it('gives custom AM rows the explicit 06:00-09:00 window even when the subscription window is evening', () => {
    expect(deliverySlotWindow({ deliverySlot: 'AM', subscription: customSubscription })).toEqual({
      startMinute: 6 * 60,
      endMinute: 9 * 60,
    });
  });

  it('gives custom PM rows the explicit 17:00-20:00 window', () => {
    expect(deliverySlotWindow({ deliverySlot: 'PM', subscription: customSubscription })).toEqual({
      startMinute: 17 * 60,
      endMinute: 20 * 60,
    });
  });

  it('splits a mixed AM/PM schedule into distinct morning and evening rows', () => {
    expect(deliverySlotWindow({ deliverySlot: 'AM', subscription: customSubscription })).toEqual({
      startMinute: 6 * 60,
      endMinute: 9 * 60,
    });
    expect(deliverySlotWindow({ deliverySlot: 'PM', subscription: customSubscription })).toEqual({
      startMinute: 17 * 60,
      endMinute: 20 * 60,
    });
  });

  it('keeps the subscription window for regular rows (slot defaults to AM but the real window wins)', () => {
    expect(deliverySlotWindow({ deliverySlot: 'AM', subscription: regularSubscription })).toEqual({
      startMinute: 6 * 60,
      endMinute: 9 * 60,
    });
  });

  it('falls back to the subscription window when no explicit slot is set', () => {
    expect(deliverySlotWindow({ deliverySlot: null, subscription: regularSubscription })).toEqual({
      startMinute: 6 * 60,
      endMinute: 9 * 60,
    });
    expect(deliverySlotWindow({ subscription: regularSubscription })).toEqual({
      startMinute: regularSubscription.deliveryWindowStartMinute,
      endMinute: regularSubscription.deliveryWindowEndMinute,
    });
  });

  it('does not force a slot window on regular rows with a default AM slot', () => {
    // A catalog subscription with an evening window must keep its window even
    // though the row carries the default 'AM' slot.
    const eveningRegular = { ...regularSubscription, deliveryWindowStartMinute: 17 * 60, deliveryWindowEndMinute: 20 * 60 };
    expect(deliverySlotWindow({ deliverySlot: 'AM', subscription: eveningRegular })).toEqual({
      startMinute: 17 * 60,
      endMinute: 20 * 60,
    });
  });
});