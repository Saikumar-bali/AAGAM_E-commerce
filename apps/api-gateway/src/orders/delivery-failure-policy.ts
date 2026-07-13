import { DeliveryResolutionAction } from "@aagam/database";
import { DeliveryFailureReason } from "./delivery-operations.dto";

export const FAILURE_POLICY_VERSION = "phase5-v1";

export const FAILURE_POLICY: Record<
  DeliveryFailureReason,
  {
    action: DeliveryResolutionAction;
    rationale: string;
  }
> = {
  CUSTOMER_UNREACHABLE: {
    action: DeliveryResolutionAction.RETRY_DELIVERY,
    rationale:
      "A controlled retry preserves the assignment while another customer contact attempt is made.",
  },
  CUSTOMER_REFUSED: {
    action: DeliveryResolutionAction.RETURN_TO_STORE,
    rationale:
      "A refused parcel must remain with the assigned rider until the owning store confirms its return.",
  },
  ADDRESS_NOT_FOUND: {
    action: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
    rationale:
      "Operations must validate the service address before choosing retry, reassign, return, or cancellation.",
  },
  WRONG_ADDRESS: {
    action: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
    rationale:
      "The supplied address requires an audited administrative correction decision.",
  },
  PAYMENT_NOT_AVAILABLE: {
    action: DeliveryResolutionAction.RETRY_DELIVERY,
    rationale:
      "A single controlled retry is recommended before returning an otherwise deliverable COD parcel.",
  },
  VEHICLE_BREAKDOWN: {
    action: DeliveryResolutionAction.REASSIGN_RIDER,
    rationale:
      "The parcel should return to dispatch for a different available rider.",
  },
  PACKAGE_DAMAGED: {
    action: DeliveryResolutionAction.RETURN_TO_STORE,
    rationale:
      "A damaged parcel requires physical store receipt and inspection.",
  },
  SAFETY_CONCERN: {
    action: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
    rationale:
      "Safety incidents require human operations review before any further movement.",
  },
  OTHER: {
    action: DeliveryResolutionAction.ESCALATE_TO_ADMIN,
    rationale:
      "Unclassified failures require an explicit administrative decision.",
  },
};

export function decideFailureResolution(reason: DeliveryFailureReason) {
  return {
    reason,
    ...FAILURE_POLICY[reason],
    policyVersion: FAILURE_POLICY_VERSION,
  };
}
