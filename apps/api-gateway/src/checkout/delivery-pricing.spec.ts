import {
  calculateDeliveryPricing,
  DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM,
  DELIVERY_RATE_PAISE_PER_KM,
  FREE_DELIVERY_MINIMUM_PAISE,
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

  it('recalculates the distance fee when the cart drops below ₹99', () => {
    expect(DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM).toBe(15);
    expect(calculateDeliveryPricing(35.7, 12_000)).toMatchObject({
      serviceable: false,
      distanceFeePaise: 5_355,
      waivedByThreshold: false,
      payableFeePaise: 5_355,
    });
    expect(calculateDeliveryPricing(35.7, 6_000)).toMatchObject({
      serviceable: false,
      distanceFeePaise: 5_355,
      waivedByThreshold: false,
      payableFeePaise: 5_355,
    });
  });

  it('uses a 15 kilometre default service radius', () => {
    expect(calculateDeliveryPricing(15, 6_000).serviceable).toBe(true);
    expect(calculateDeliveryPricing(15.001, 6_000)).toMatchObject({
      serviceable: false,
      maximumDistanceKm: 15,
    });
  });

  it('supports an operational distance limit without mislabeling the fee as free', () => {
    const previous = process.env.DELIVERY_MAX_DISTANCE_KM;
    process.env.DELIVERY_MAX_DISTANCE_KM = '8';
    try {
      expect(calculateDeliveryPricing(8.001, 7_000)).toMatchObject({
        serviceable: false,
        maximumDistanceKm: 8,
        distanceFeePaise: 1_200,
        payableFeePaise: 1_200,
      });
    } finally {
      if (previous === undefined) delete process.env.DELIVERY_MAX_DISTANCE_KM;
      else process.env.DELIVERY_MAX_DISTANCE_KM = previous;
    }
  });

  it('rejects invalid distances', () => {
    expect(calculateDeliveryPricing(Number.NaN, 7_000).serviceable).toBe(false);
    expect(calculateDeliveryPricing(-1, 7_000).serviceable).toBe(false);
  });
});
