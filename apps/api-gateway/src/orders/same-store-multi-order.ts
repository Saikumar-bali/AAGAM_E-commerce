import { DeliveryJobStatus } from '@aagam/types';

export const SAME_STORE_ADD_ON_STATUSES = [
  DeliveryJobStatus.RIDER_ASSIGNED,
  DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
  DeliveryJobStatus.RIDER_AT_STORE,
] as const;

type ActiveJobForCompatibility = {
  storeId: string;
  status: string;
};

export function canAddOrderFromStore(
  activeJobs: ActiveJobForCompatibility[],
  storeId: string,
) {
  return activeJobs.every(
    (job) =>
      job.storeId === storeId &&
      (SAME_STORE_ADD_ON_STATUSES as readonly string[]).includes(job.status),
  );
}
