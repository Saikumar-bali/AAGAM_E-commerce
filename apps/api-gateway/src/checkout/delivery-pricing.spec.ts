import {
  calculateDeliveryPricing,
  DELIVERY_RATE_PAISE_PER_KM,
  FREE_DELIVERY_MINIMUM_PAISE,
  MAXIMUM_DELIVERY_DISTANCE_KM,
} from './delivery-pricing';

describe('distance delivery pricing', () => {
  it('charges ₹1.50 per kilometre and rounds once to the nearest paise', () => {
    expect(DELIVERY_RATE_PAISE_PER_KM).toBe(150);
    expect(calculateDeliveryPricing(1, 7_000).payableFeePaise).toBe(150);
    expect(calculateDeliveryPricing(3.25, 7_000).payableFeePaise).toBe(488);
    expect(calculateDeliveryPricing(8, 7_000).payableFeePaise).toBe(1_200);
  });

  it('waives the distance fee at a ₹99 subtotal', () => {
    expect(FREE_DELIVERY_MINIMUM_PAISE).toBe(9_900);
    expect(calculateDeliveryPricing(7.8, 9_899)).toMatchObject({
      distanceFeePaise: 1_170,
      waivedByThreshold: false,
      payableFeePaise: 1_170,
    });
    expect(calculateDeliveryPricing(7.8, 9_900)).toMatchObject({
      distanceFeePaise: 1_170,
      waivedByThreshold: true,
      payableFeePaise: 0,
    });
  });

  it('retains the eight kilometre service boundary', () => {
    expect(MAXIMUM_DELIVERY_DISTANCE_KM).toBe(8);
    expect(calculateDeliveryPricing(8, 7_000).serviceable).toBe(true);
    expect(calculateDeliveryPricing(8.001, 7_000)).toMatchObject({
      serviceable: false,
      distanceFeePaise: 0,
      payableFeePaise: 0,
    });
  });

  it('rejects invalid distances', () => {
    expect(calculateDeliveryPricing(Number.NaN, 7_000).serviceable).toBe(false);
    expect(calculateDeliveryPricing(-1, 7_000).serviceable).toBe(false);
  });
});
