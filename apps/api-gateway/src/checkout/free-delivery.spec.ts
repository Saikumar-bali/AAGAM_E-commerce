import {
  applyFreeDeliveryThreshold,
  FREE_DELIVERY_MINIMUM_PAISE,
} from './checkout.service';

describe('free delivery threshold', () => {
  it('waives delivery at ₹99 and above', () => {
    expect(FREE_DELIVERY_MINIMUM_PAISE).toBe(9900);
    expect(applyFreeDeliveryThreshold(12, 9900)).toBe(0);
    expect(applyFreeDeliveryThreshold(12, 35000)).toBe(0);
  });

  it('preserves the distance fee below ₹99', () => {
    expect(applyFreeDeliveryThreshold(12, 9899)).toBe(12);
  });
});
