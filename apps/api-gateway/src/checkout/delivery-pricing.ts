export const DELIVERY_RATE_PAISE_PER_KM = 150;
export const FREE_DELIVERY_MINIMUM_PAISE = 9_900;
export const MAXIMUM_DELIVERY_DISTANCE_KM = 8;

export type DeliveryPricing = {
  serviceable: boolean;
  ratePaisePerKm: number;
  freeDeliveryMinimumPaise: number;
  maximumDistanceKm: number;
  distanceFeePaise: number;
  waivedByThreshold: boolean;
  payableFeePaise: number;
};

export function calculateDeliveryPricing(
  distanceKm: number,
  subtotalPaise?: number,
): DeliveryPricing {
  const serviceable = Number.isFinite(distanceKm)
    && distanceKm >= 0
    && distanceKm <= MAXIMUM_DELIVERY_DISTANCE_KM;
  const distanceFeePaise = serviceable
    ? Math.max(0, Math.round(distanceKm * DELIVERY_RATE_PAISE_PER_KM))
    : 0;
  const waivedByThreshold = serviceable
    && Number.isFinite(subtotalPaise)
    && Number(subtotalPaise) >= FREE_DELIVERY_MINIMUM_PAISE;

  return {
    serviceable,
    ratePaisePerKm: DELIVERY_RATE_PAISE_PER_KM,
    freeDeliveryMinimumPaise: FREE_DELIVERY_MINIMUM_PAISE,
    maximumDistanceKm: MAXIMUM_DELIVERY_DISTANCE_KM,
    distanceFeePaise,
    waivedByThreshold,
    payableFeePaise: waivedByThreshold ? 0 : distanceFeePaise,
  };
}

export function applyFreeDeliveryThreshold(deliveryFee: number, subtotalPaise: number): number {
  return subtotalPaise >= FREE_DELIVERY_MINIMUM_PAISE ? 0 : deliveryFee;
}
