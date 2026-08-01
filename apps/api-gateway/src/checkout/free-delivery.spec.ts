import {
  applyFreeDeliveryThreshold,
  FREE_DELIVERY_MINIMUM_PAISE,
} from './checkout.service';

describe('free delivery threshold', () => {
  it('waives delivery at ₹199 and above', () => {
    expect(FREE_DELIVERY_MINIMUM_PAISE).toBe(19900);
    expect(applyFreeDeliveryThreshold(19, 19900)).toBe(0);
    expect(applyFreeDeliveryThreshold(49, 35000)).toBe(0);
  });

  it('preserves the distance fee below ₹199', () => {
    expect(applyFreeDeliveryThreshold(19, 19899)).toBe(19);
  });
});
