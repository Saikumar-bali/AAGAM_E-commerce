import { formatDeliveryCode, secondsUntilExpiry, shouldShowDeliveryCode } from './deliveryCode';

describe('customer delivery code helpers', () => {
  it('shows the code only when the rider is at the customer', () => {
    expect(shouldShowDeliveryCode('RIDER_AT_CUSTOMER')).toBe(true);
    expect(shouldShowDeliveryCode('OUT_FOR_DELIVERY')).toBe(false);
    expect(shouldShowDeliveryCode(null)).toBe(false);
  });

  it('formats a six digit code for easy reading', () => {
    expect(formatDeliveryCode('123456')).toBe('1 2 3 4 5 6');
    expect(formatDeliveryCode('12-34-56-78')).toBe('1 2 3 4 5 6');
  });

  it('returns a non-negative expiry countdown', () => {
    expect(secondsUntilExpiry('2026-07-29T12:00:30.000Z', Date.parse('2026-07-29T12:00:00.000Z'))).toBe(30);
    expect(secondsUntilExpiry('2026-07-29T11:59:00.000Z', Date.parse('2026-07-29T12:00:00.000Z'))).toBe(0);
  });
});
