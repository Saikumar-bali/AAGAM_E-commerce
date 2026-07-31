import { PromotionStatus } from "@aagam/database";

/**
 * The admin form is a publish action by default. Draft and paused campaigns
 * remain explicit lifecycle states; a publish request with a future start is
 * represented as scheduled so the admin and customer feeds agree.
 */
export function resolveCampaignStatus(
  requestedStatus: PromotionStatus | undefined,
  startsAt?: string | Date | null,
  now: Date = new Date(),
): PromotionStatus {
  if (
    requestedStatus === PromotionStatus.DRAFT ||
    requestedStatus === PromotionStatus.PAUSED ||
    requestedStatus === PromotionStatus.ARCHIVED
  ) {
    return requestedStatus;
  }

  if (startsAt) {
    const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
    if (!Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
      return PromotionStatus.SCHEDULED;
    }
  }

  return PromotionStatus.ACTIVE;
}
