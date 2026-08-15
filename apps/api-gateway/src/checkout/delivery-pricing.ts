export const DELIVERY_RATE_PAISE_PER_KM = 200;
export const FREE_DELIVERY_MINIMUM_PAISE = 9_900;
export const DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM = 15;

export type DeliveryPricing = {
  serviceable: boolean;
  ratePaisePerKm: number;
  freeDeliveryMinimumPaise: number;
  maximumDistanceKm: number;
  distanceFeePaise: number;
  waivedByThreshold: boolean;
  waivedByFirstOrder: boolean;
  payableFeePaise: number;
};

export function calculateDeliveryPricing(
  distanceKm: number,
  subtotalPaise?: number,
  firstOrderEligible = false,
): DeliveryPricing {
  const configuredMaximum = Number(process.env.DELIVERY_MAX_DISTANCE_KM);
  const maximumDistanceKm = Number.isFinite(configuredMaximum) && configuredMaximum > 0
    ? configuredMaximum
    : DEFAULT_MAXIMUM_DELIVERY_DISTANCE_KM;
  const validDistance = Number.isFinite(distanceKm) && distanceKm >= 0;
  const serviceable = validDistance
    && distanceKm <= maximumDistanceKm;
  const distanceFeePaise = validDistance
    ? Math.max(0, Math.round(distanceKm * DELIVERY_RATE_PAISE_PER_KM))
    : 0;
  const waivedByThreshold = serviceable
    && Number.isFinite(subtotalPaise)
    && Number(subtotalPaise) >= FREE_DELIVERY_MINIMUM_PAISE;
  const waivedByFirstOrder = serviceable && firstOrderEligible;

  return {
    serviceable,
    ratePaisePerKm: DELIVERY_RATE_PAISE_PER_KM,
    freeDeliveryMinimumPaise: FREE_DELIVERY_MINIMUM_PAISE,
    maximumDistanceKm,
    distanceFeePaise,
    waivedByThreshold,
    waivedByFirstOrder,
    payableFeePaise: waivedByThreshold || waivedByFirstOrder ? 0 : distanceFeePaise,
  };
}

export function applyFreeDeliveryThreshold(deliveryFee: number, subtotalPaise: number): number {
  return subtotalPaise >= FREE_DELIVERY_MINIMUM_PAISE ? 0 : deliveryFee;
}
