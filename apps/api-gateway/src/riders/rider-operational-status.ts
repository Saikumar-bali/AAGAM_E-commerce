import { DeliveryJobStatus, DeliveryRunStatus } from "@aagam/database";

const TERMINAL_JOB_STATUSES = [
  DeliveryJobStatus.DELIVERED,
  DeliveryJobStatus.RETURNED_TO_STORE,
  DeliveryJobStatus.CANCELLED,
];

const TERMINAL_RUN_STATUSES = [
  DeliveryRunStatus.COMPLETED,
  DeliveryRunStatus.CANCELLED,
];

/** Keep BUSY derived from all operational work instead of one completed order. */
export async function reconcileRiderOperationalStatus(tx: any, riderProfileId: string) {
  const [activeJobs, activeRuns] = await Promise.all([
    tx.deliveryJob.count({
      where: {
        currentRiderId: riderProfileId,
        status: { notIn: TERMINAL_JOB_STATUSES as any },
      },
    }),
    tx.deliveryRun.count({
      where: {
        riderId: riderProfileId,
        status: { notIn: TERMINAL_RUN_STATUSES as any },
      },
    }),
  ]);
  const status = activeJobs > 0 || activeRuns > 0 ? "BUSY" : "ONLINE";
  await tx.riderProfile.updateMany({
    where: { id: riderProfileId, status: { not: "OFFLINE" } },
    data: { status },
  });
  return status;
}
