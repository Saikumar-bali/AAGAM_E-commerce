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

/**
 * A DELIVERY_FAILED job whose system resolution decision (RETRY_DELIVERY by
 * default) was recorded but never applied does not occupy the Rider forever.
 * Retrying immediately is a live, real-time act; when the decision goes stale
 * without action, the assignment evaporates and the Rider's dispatch capacity
 * must be released so they can serve other deliveries. Any later resolution
 * (REASSIGN_RIDER / RETURN_TO_STORE / CANCEL_AND_REFUND) moves the job out of
 * DELIVERY_FAILED through the normal workflow and re-evaluates occupancy.
 */
export function failureRiderReleaseAfterMs(): number {
  const parsed = Number(process.env.FAILURE_RIDER_RELEASE_AFTER_MS);
  if (Number.isFinite(parsed) && parsed >= 60_000) return parsed;
  return 2 * 60 * 60 * 1000;
}

export type OccupancyCandidate = {
  status: string;
  failureDecisions?: Array<{
    status?: string;
    createdAt: Date;
    appliedAt: Date | null;
  }>;
};

/**
 * True when a DeliveryJob still occupies the Rider's operational capacity.
 * DELIVERY_FAILED only counts while the recorded resolution decision is still
 * fresh (recently decided, not yet applied); an unapplied stale decision
 * releases the Rider instead of pinning them BUSY indefinitely.
 */
export function isOccupyingDeliveryJob(
  candidate: OccupancyCandidate,
  now: Date = new Date(),
): boolean {
  if (candidate.status !== DeliveryJobStatus.DELIVERY_FAILED) return true;
  const decision = candidate.failureDecisions?.[0];
  if (!decision || decision.status !== 'DECIDED') return true;
  if (decision.appliedAt) return false;
  const staleAt = decision.createdAt.getTime() + failureRiderReleaseAfterMs();
  return now.getTime() <= staleAt;
}

/** Keep BUSY derived from all operational work instead of one completed order. */
export async function reconcileRiderOperationalStatus(tx: any, riderProfileId: string) {
  const [jobs, activeRuns] = await Promise.all([
    tx.deliveryJob.findMany({
      where: {
        currentRiderId: riderProfileId,
        status: { notIn: TERMINAL_JOB_STATUSES as any },
      },
      select: {
        id: true,
        status: true,
        failureDecisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            createdAt: true,
            appliedAt: true,
          },
        },
      },
    }) as Promise<OccupancyCandidate[]>,
    tx.deliveryRun.count({
      where: {
        riderId: riderProfileId,
        status: { notIn: TERMINAL_RUN_STATUSES as any },
      },
    }),
  ]);
  const now = new Date();
  const hasActiveJobs = jobs.some((job) => isOccupyingDeliveryJob(job, now));
  const status = hasActiveJobs || activeRuns > 0 ? "BUSY" : "ONLINE";
  await tx.riderProfile.updateMany({
    where: { id: riderProfileId, status: { not: "OFFLINE" } },
    data: { status },
  });
  return status;
}