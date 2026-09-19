/**
 * A subscription plan is only buyable when it can resolve at least one eligible
 * store. The serviceability resolver narrows candidate stores by the plan's store
 * bindings and then by the delivery zone's store links, so a plan with neither a
 * store nor a zone binding can never resolve a store and every subscribe attempt
 * fails with STORE_OUT_OF_RADIUS ("Eligible stores are outside the configured
 * delivery radius") after the customer has already chosen an address and start date.
 *
 * Keeping the rule in one place lets the publish guard and the customer-facing
 * availability flags agree.
 */
export type PlanAvailability = {
  isAvailable: boolean;
  availabilityIssue: 'NO_FULFILMENT_BINDING' | null;
};

export const NO_FULFILMENT_BINDING_MESSAGE =
  'Add at least one applicable store or delivery zone before publishing this plan';

export function planAvailability(input: {
  storeCount: number;
  zoneCount: number;
}): PlanAvailability {
  const isAvailable = input.storeCount > 0 || input.zoneCount > 0;
  return {
    isAvailable,
    availabilityIssue: isAvailable ? null : 'NO_FULFILMENT_BINDING',
  };
}
