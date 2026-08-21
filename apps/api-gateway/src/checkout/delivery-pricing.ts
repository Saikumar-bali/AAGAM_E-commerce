export const DELIVERY_RATE_PAISE_PER_KM = 200;
export const FREE_DELIVERY_MINIMUM_PAISE = 9_900;
export const DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM = 15;

export type DeliveryFeeRuleOverrides = {
  ruleId?: string | null;
  ruleName?: string | null;
  matchType?: string | null;
  ratePaisePerKm?: number | null;
  flatFeePaise?: number | null;
  freeDeliveryMinimumPaise?: number | null;
  maximumDistanceKm?: number | null;
};

export type DeliveryPricing = {
  serviceable: boolean;
  ratePaisePerKm: number;
  freeDeliveryMinimumPaise: number;
  maximumDistanceKm: number;
  distanceFeePaise: number;
  waivedByThreshold: boolean;
  waivedByFirstOrder: boolean;
  payableFeePaise: number;
  appliedRule: { id: string; name: string; matchType: string } | null;
  flatFeePaise: number | null;
};

export function calculateDeliveryPricing(
  distanceKm: number,
  subtotalPaise?: number,
  firstOrderEligible = false,
  overrides: DeliveryFeeRuleOverrides = {},
): DeliveryPricing {
  const hasRule = Boolean(overrides.ruleId);

  if (!hasRule) {
    return {
      serviceable: false,
      ratePaisePerKm: DELIVERY_RATE_PAISE_PER_KM,
      freeDeliveryMinimumPaise: FREE_DELIVERY_MINIMUM_PAISE,
      maximumDistanceKm: DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM,
      distanceFeePaise: 0,
      waivedByThreshold: false,
      waivedByFirstOrder: false,
      payableFeePaise: 0,
      appliedRule: null,
      flatFeePaise: null,
    };
  }

  const configuredMaximum = Number(process.env.DELIVERY_MAX_DISTANCE_KM);
  const globalMaximum = Number.isFinite(configuredMaximum) && configuredMaximum > 0
    ? configuredMaximum
    : DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM;
  const maximumDistanceKm = Number.isFinite(overrides.maximumDistanceKm) && overrides.maximumDistanceKm! > 0
    ? overrides.maximumDistanceKm!
    : globalMaximum;
  const ratePaisePerKm = Number.isFinite(overrides.ratePaisePerKm) && overrides.ratePaisePerKm! >= 0
    ? overrides.ratePaisePerKm!
    : DELIVERY_RATE_PAISE_PER_KM;
  const freeDeliveryMinimumPaise = Number.isFinite(overrides.freeDeliveryMinimumPaise)
    ? overrides.freeDeliveryMinimumPaise!
    : FREE_DELIVERY_MINIMUM_PAISE;
  const flatFeePaise = Number.isFinite(overrides.flatFeePaise) && overrides.flatFeePaise! >= 0
    ? overrides.flatFeePaise!
    : null;

  const validDistance = Number.isFinite(distanceKm) && distanceKm >= 0;
  const serviceable = validDistance
    && distanceKm <= maximumDistanceKm;
  const distanceFeePaise = validDistance
    ? flatFeePaise !== null
      ? flatFeePaise
      : Math.max(0, Math.round(distanceKm * ratePaisePerKm))
    : 0;
  const waivedByThreshold = serviceable
    && Number.isFinite(subtotalPaise)
    && Number(subtotalPaise) >= freeDeliveryMinimumPaise;
  const waivedByFirstOrder = serviceable && firstOrderEligible;

  return {
    serviceable,
    ratePaisePerKm,
    freeDeliveryMinimumPaise,
    maximumDistanceKm,
    distanceFeePaise,
    waivedByThreshold,
    waivedByFirstOrder,
    payableFeePaise: waivedByThreshold || waivedByFirstOrder ? 0 : distanceFeePaise,
    appliedRule: overrides.ruleId
      ? { id: overrides.ruleId, name: overrides.ruleName ?? '', matchType: overrides.matchType ?? '' }
      : null,
    flatFeePaise,
  };
}

export function applyFreeDeliveryThreshold(deliveryFee: number, subtotalPaise: number): number {
  return subtotalPaise >= FREE_DELIVERY_MINIMUM_PAISE ? 0 : deliveryFee;
}
