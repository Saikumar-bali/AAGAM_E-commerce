import {
  calculateDeliveryPricing,
  DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM,
  DELIVERY_RATE_PAISE_PER_KM,
  FREE_DELIVERY_MINIMUM_PAISE,
} from './delivery-pricing';

describe('distance delivery pricing', () => {
  it('charges ₹2.00 per kilometre and rounds once to the nearest paise', () => {
    expect(DELIVERY_RATE_PAISE_PER_KM).toBe(200);
    expect(calculateDeliveryPricing(1, 7_000).payableFeePaise).toBe(200);
    expect(calculateDeliveryPricing(3.25, 7_000).payableFeePaise).toBe(650);
    expect(calculateDeliveryPricing(8, 7_000).payableFeePaise).toBe(1_600);
  });

  it('waives the distance fee at a ₹99 subtotal', () => {
    expect(FREE_DELIVERY_MINIMUM_PAISE).toBe(9_900);
    expect(calculateDeliveryPricing(7.8, 9_899)).toMatchObject({
      distanceFeePaise: 1_560,
      waivedByThreshold: false,
      payableFeePaise: 1_560,
    });
    expect(calculateDeliveryPricing(7.8, 9_900)).toMatchObject({
      distanceFeePaise: 1_560,
      waivedByThreshold: true,
      payableFeePaise: 0,
    });
  });

  it('waives delivery for an eligible first order below the subtotal threshold', () => {
    expect(calculateDeliveryPricing(3.25, 6_000, true)).toMatchObject({
      distanceFeePaise: 650,
      waivedByThreshold: false,
      waivedByFirstOrder: true,
      payableFeePaise: 0,
    });
  });

  it('does not mark an out-of-range first order as a free deliverable order', () => {
    expect(calculateDeliveryPricing(15.001, 6_000, true)).toMatchObject({
      serviceable: false,
      waivedByFirstOrder: false,
    });
  });

  it('recalculates the distance fee when the cart drops below ₹99', () => {
    expect(DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM).toBe(15);
    expect(calculateDeliveryPricing(35.7, 12_000)).toMatchObject({
      serviceable: false,
      distanceFeePaise: 7_140,
      waivedByThreshold: false,
      payableFeePaise: 7_140,
    });
    expect(calculateDeliveryPricing(35.7, 6_000)).toMatchObject({
      serviceable: false,
      distanceFeePaise: 7_140,
      waivedByThreshold: false,
      payableFeePaise: 7_140,
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
        distanceFeePaise: 1_600,
        payableFeePaise: 1_600,
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

  it('applies a locality rate override while keeping the default fallback intact', () => {
    const pricing = calculateDeliveryPricing(5, 7_000, false, {
      ruleId: 'rule-thummapala',
      ruleName: 'Thummapala',
      matchType: 'KEYWORD',
      ratePaisePerKm: 300,
    });
    expect(pricing.ratePaisePerKm).toBe(300);
    expect(pricing.distanceFeePaise).toBe(1_500);
    expect(pricing.payableFeePaise).toBe(1_500);
    expect(pricing.appliedRule).toEqual({
      id: 'rule-thummapala',
      name: 'Thummapala',
      matchType: 'KEYWORD',
    });
    // default path is unchanged when no override is provided
    expect(calculateDeliveryPricing(5, 7_000).payableFeePaise).toBe(1_000);
  });

  it('uses a flat fee instead of per-kilometre rate when the rule sets one', () => {
    const pricing = calculateDeliveryPricing(9, 7_000, false, {
      ruleId: 'rule-flat',
      ruleName: 'Flat locality',
      matchType: 'PINCODE',
      flatFeePaise: 4_000,
      ratePaisePerKm: 200,
    });
    expect(pricing.flatFeePaise).toBe(4_000);
    expect(pricing.distanceFeePaise).toBe(4_000);
    expect(pricing.payableFeePaise).toBe(4_000);
  });

  it('honours rule-level free delivery and maximum distance overrides', () => {
    const below = calculateDeliveryPricing(6, 5_000, false, {
      ruleId: 'rule-free',
      ruleName: 'Free locality',
      matchType: 'CITY',
      freeDeliveryMinimumPaise: 4_900,
    });
    expect(below.waivedByThreshold).toBe(true);
    expect(below.payableFeePaise).toBe(0);

    const capped = calculateDeliveryPricing(12, 6_000, false, {
      ruleId: 'rule-cap',
      ruleName: 'Near locality',
      matchType: 'DEFAULT',
      maximumDistanceKm: 10,
    });
    expect(capped.serviceable).toBe(false);
    expect(capped.maximumDistanceKm).toBe(10);
  });
});
