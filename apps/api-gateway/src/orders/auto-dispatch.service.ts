import { Injectable, Logger } from '@nestjs/common';
import { Prisma, prisma, Role } from '@aagam/database';
import {
  DeliveryEventType,
  DeliveryJobStatus,
  DispatchAssignmentStatus,
} from '@aagam/types';
import { calculateDistance } from '@aagam/utils';
import { DeliveryEventService } from './delivery-event.service';

const ACTIVE_JOB_STATUSES = [
  DeliveryJobStatus.RIDER_ASSIGNED,
  DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
  DeliveryJobStatus.RIDER_AT_STORE,
  DeliveryJobStatus.PICKUP_VERIFIED,
  DeliveryJobStatus.OUT_FOR_DELIVERY,
  DeliveryJobStatus.RIDER_AT_CUSTOMER,
  DeliveryJobStatus.DELIVERY_FAILED,
  DeliveryJobStatus.RETURNING_TO_STORE,
];

const RECENT_ATTEMPT_STATUSES = [
  DispatchAssignmentStatus.OFFERED,
  DispatchAssignmentStatus.ACCEPTED,
  DispatchAssignmentStatus.REJECTED,
  DispatchAssignmentStatus.EXPIRED,
  DispatchAssignmentStatus.CANCELLED,
  DispatchAssignmentStatus.REASSIGNED,
];

export type AutoDispatchOutcome = {
  deliveryJobId: string;
  offered: boolean;
  reason:
    | 'DISABLED'
    | 'JOB_NOT_FOUND'
    | 'NOT_WAITING'
    | 'MISSING_STORE_COORDINATES'
    | 'ACTIVE_ASSIGNMENT'
    | 'NO_FRESH_AVAILABLE_RIDER'
    | 'NO_RIDER_WITHIN_RADIUS'
    | 'CONCURRENT_CHANGE'
    | 'OFFERED';
  assignmentId?: string;
  riderProfileId?: string;
  riderUserId?: string;
  distanceKm?: number;
};

@Injectable()
export class AutoDispatchService {
  private readonly logger = new Logger(AutoDispatchService.name);
  private waitingSweepCursor: { updatedAt: Date; id: string } | null = null;

  constructor(private readonly events: DeliveryEventService) {}

  private numberEnv(name: string, fallback: number, minimum: number, maximum: number) {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, parsed));
  }

  private isEnabled() {
    const configured = process.env.AUTO_DISPATCH_ENABLED?.trim().toLowerCase();
    if (configured) return configured === 'true';

    // E2E and unit suites exercise manual dispatch unless explicitly enabled.
    return process.env.NODE_ENV !== 'test';
  }

  private offerExpirySeconds() {
    return Math.floor(this.numberEnv('AUTO_DISPATCH_OFFER_EXPIRY_SECONDS', 60, 15, 300));
  }

  private maxPickupKm() {
    return this.numberEnv('AUTO_DISPATCH_MAX_PICKUP_KM', 8, 0.5, 100);
  }

  private locationMaxAgeSeconds() {
    return Math.floor(this.numberEnv('AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS', 180, 30, 86_400));
  }

  private retryCooldownSeconds() {
    return Math.floor(this.numberEnv('AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS', 300, 30, 86_400));
  }

  private reconcileLimit() {
    return Math.floor(this.numberEnv('AUTO_DISPATCH_RECONCILE_LIMIT', 50, 1, 250));
  }

  private reconcileScanLimit(offerLimit: number) {
    return Math.floor(
      this.numberEnv(
        'AUTO_DISPATCH_RECONCILE_SCAN_LIMIT',
        Math.max(offerLimit, offerLimit * 10),
        offerLimit,
        5_000,
      ),
    );
  }

  async dispatchWaitingJobs(limitInput = this.reconcileLimit()) {
    if (!this.isEnabled()) return { scanned: 0, offered: 0 };

    const offerLimit = Math.max(
      1,
      Math.min(250, Math.floor(limitInput || this.reconcileLimit())),
    );
    const scanLimit = this.reconcileScanLimit(offerLimit);
    const pageSize = Math.min(100, scanLimit);
    const baseWhere: Prisma.DeliveryJobWhereInput = {
      status: DeliveryJobStatus.WAITING_FOR_DISPATCH,
      currentRiderId: null,
      assignments: {
        none: {
          status: {
            in: [
              DispatchAssignmentStatus.OFFERED,
              DispatchAssignmentStatus.ACCEPTED,
            ],
          },
        },
      },
    };

    const startingCursor = this.waitingSweepCursor;
    const seenIds = new Set<string>();
    let after = startingCursor;
    let wrapped = false;
    let scanned = 0;
    let offered = 0;

    sweep: while (offered < offerLimit && scanned < scanLimit) {
      const take = Math.min(pageSize, scanLimit - scanned);
      const jobs: Array<{ id: string; updatedAt: Date }> =
        await prisma.deliveryJob.findMany({
          where: {
            ...baseWhere,
            ...(after
              ? {
                  OR: [
                    { updatedAt: { gt: after.updatedAt } },
                    { updatedAt: after.updatedAt, id: { gt: after.id } },
                  ],
                }
              : {}),
          },
          select: { id: true, updatedAt: true },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take,
        });

      if (jobs.length === 0) {
        if (!wrapped && startingCursor) {
          after = null;
          wrapped = true;
          continue;
        }
        break;
      }

      for (const job of jobs) {
        if (seenIds.has(job.id)) break sweep;
        seenIds.add(job.id);
        scanned += 1;
        after = { updatedAt: job.updatedAt, id: job.id };
        this.waitingSweepCursor = after;

        const outcome = await this.dispatchNearestRider(job.id).catch((error) => {
          this.logger.warn(
            `Waiting-job dispatch failed for ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        });
        if (outcome?.offered) offered += 1;
        if (offered >= offerLimit || scanned >= scanLimit) break sweep;
      }

      if (jobs.length < take) {
        if (!wrapped && startingCursor) {
          after = null;
          wrapped = true;
          continue;
        }
        break;
      }
    }

    return { scanned, offered };
  }

  async dispatchNearestRider(deliveryJobId: string): Promise<AutoDispatchOutcome> {
    if (!this.isEnabled()) {
      this.logger.debug(`Auto-dispatch disabled for job ${deliveryJobId}`);
      return { deliveryJobId, offered: false, reason: 'DISABLED' };
    }

    const job = await prisma.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      include: {
        order: {
          include: {
            store: { select: { id: true, latitude: true, longitude: true } },
          },
        },
      },
    });

    if (!job) return { deliveryJobId, offered: false, reason: 'JOB_NOT_FOUND' };
    if (job.status !== DeliveryJobStatus.WAITING_FOR_DISPATCH || job.currentRiderId) {
      return { deliveryJobId, offered: false, reason: 'NOT_WAITING' };
    }
    if (
      !Number.isFinite(job.order.store.latitude) ||
      !Number.isFinite(job.order.store.longitude)
    ) {
      this.logger.warn(
        `Store ${job.order.storeId} has no valid coordinates — skipping auto-dispatch for job ${deliveryJobId}`,
      );
      return {
        deliveryJobId,
        offered: false,
        reason: 'MISSING_STORE_COORDINATES',
      };
    }

    const now = new Date();
    const expired = await prisma.dispatchAssignment.findMany({
      where: {
        deliveryJobId,
        status: DispatchAssignmentStatus.OFFERED,
        expiresAt: { lt: now },
      },
      select: { id: true, riderProfileId: true, expiresAt: true },
    });
    for (const assignment of expired) {
      const changed = await prisma.dispatchAssignment.updateMany({
        where: {
          id: assignment.id,
          status: DispatchAssignmentStatus.OFFERED,
          expiresAt: { lt: now },
        },
        data: { status: DispatchAssignmentStatus.EXPIRED, respondedAt: now },
      });
      if (changed.count !== 1) continue;
      await this.events.record({
        deliveryJobId,
        assignmentId: assignment.id,
        eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
        actor: { id: null, role: Role.ADMIN },
        metadata: {
          source: 'AUTO_DISPATCH_RECONCILER',
          riderProfileId: assignment.riderProfileId,
          expiresAt: assignment.expiresAt?.toISOString() || null,
        },
      }).catch(() => undefined);
    }

    const activeAssignment = await prisma.dispatchAssignment.findFirst({
      where: {
        deliveryJobId,
        status: {
          in: [
            DispatchAssignmentStatus.OFFERED,
            DispatchAssignmentStatus.ACCEPTED,
          ],
        },
      },
      select: { id: true },
    });
    if (activeAssignment) {
      return { deliveryJobId, offered: false, reason: 'ACTIVE_ASSIGNMENT' };
    }

    const storeLat = job.order.store.latitude;
    const storeLng = job.order.store.longitude;
    const locationFreshAfter = new Date(
      now.getTime() - this.locationMaxAgeSeconds() * 1000,
    );
    const retryCutoff = new Date(
      now.getTime() - this.retryCooldownSeconds() * 1000,
    );

    const recentlyTriedRiderIds = (
      await prisma.dispatchAssignment.findMany({
        where: {
          deliveryJobId,
          status: { in: RECENT_ATTEMPT_STATUSES as any },
          updatedAt: { gte: retryCutoff },
        },
        select: { riderProfileId: true },
      })
    ).map((assignment) => assignment.riderProfileId);

    const recentRiderFilter = recentlyTriedRiderIds.length > 0
      ? Prisma.sql`AND rider."id" NOT IN (${Prisma.join(recentlyTriedRiderIds)})`
      : Prisma.empty;
    const candidates = await prisma.$queryRaw<Array<{
      id: string;
      userId: string;
      status: 'ONLINE' | 'BUSY';
      name: string | null;
      latitude: number;
      longitude: number;
      capturedAt: Date;
    }>>(Prisma.sql`
      SELECT
        rider."id",
        rider."userId",
        rider."status",
        account."name",
        location."latitude",
        location."longitude",
        location."capturedAt"
      FROM "RiderProfile" AS rider
      JOIN "User" AS account ON account."id" = rider."userId"
      JOIN "RiderAvailabilityLocation" AS location
        ON location."riderProfileId" = rider."id"
      WHERE rider."status" IN ('ONLINE'::"RiderStatus", 'BUSY'::"RiderStatus")
        AND location."capturedAt" >= ${locationFreshAfter}
        ${recentRiderFilter}
    `);

    if (candidates.length === 0) {
      this.logger.log(
        `No fresh eligible riders for auto-dispatch on job ${deliveryJobId}`,
      );
      return {
        deliveryJobId,
        offered: false,
        reason: 'NO_FRESH_AVAILABLE_RIDER',
      };
    }

    const candidateIds = candidates.map((candidate) => candidate.id);
    const [activeJobs, openOffers] = await Promise.all([
      prisma.deliveryJob.findMany({
        where: {
          currentRiderId: { in: candidateIds },
          status: { in: ACTIVE_JOB_STATUSES as any },
        },
        select: { currentRiderId: true, status: true, order: { select: { storeId: true } } },
      }),
      prisma.dispatchAssignment.findMany({
        where: {
          deliveryJobId: { not: deliveryJobId },
          riderProfileId: { in: candidateIds },
          status: DispatchAssignmentStatus.OFFERED,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { riderProfileId: true },
      }),
    ]);

    const unavailableRiderIds = new Set<string>();
    const activeJobsByRider = new Map<string, typeof activeJobs>();
    for (const activeJob of activeJobs) {
      if (activeJob.currentRiderId) {
        const riderJobs = activeJobsByRider.get(activeJob.currentRiderId) || [];
        riderJobs.push(activeJob);
        activeJobsByRider.set(activeJob.currentRiderId, riderJobs);
      }
      if (
        activeJob.currentRiderId &&
        (activeJob.order.storeId !== job.order.storeId ||
          ![
            DeliveryJobStatus.RIDER_ASSIGNED,
            DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
            DeliveryJobStatus.RIDER_AT_STORE,
          ].includes(activeJob.status as any))
      ) unavailableRiderIds.add(activeJob.currentRiderId);
    }
    for (const openOffer of openOffers) {
      unavailableRiderIds.add(openOffer.riderProfileId);
    }

    const eligibleCandidates = candidates
      .filter((candidate) => {
        if (unavailableRiderIds.has(candidate.id)) return false;
        // BUSY is eligible only when it is derived from compatible, pre-pickup
        // work at this store. A bare BUSY status may be an administrator hold.
        return candidate.status === 'ONLINE' ||
          (activeJobsByRider.get(candidate.id)?.length || 0) > 0;
      });
    if (eligibleCandidates.length === 0) {
      return {
        deliveryJobId,
        offered: false,
        reason: 'NO_FRESH_AVAILABLE_RIDER',
      };
    }

    const maxPickupKm = this.maxPickupKm();
    const ranked = eligibleCandidates
      .map((rider) => ({
        rider,
        distanceKm: calculateDistance(
          storeLat,
          storeLng,
          rider.latitude,
          rider.longitude,
        ),
      }))
      .filter((entry) => entry.distanceKm <= maxPickupKm)
      .sort((left, right) => left.distanceKm - right.distanceKm);

    if (ranked.length === 0) {
      this.logger.log(
        `No fresh available rider within ${maxPickupKm} km for job ${deliveryJobId}`,
      );
      return {
        deliveryJobId,
        offered: false,
        reason: 'NO_RIDER_WITHIN_RADIUS',
      };
    }

    for (const candidate of ranked) {
      const outcome = await this.offerCandidate({
        deliveryJobId,
        riderProfileId: candidate.rider.id,
        riderUserId: candidate.rider.userId,
        expectedStoreLat: storeLat,
        expectedStoreLng: storeLng,
        expectedStoreId: job.order.storeId,
        locationFreshAfter,
        maxPickupKm,
      }).catch((error: any) => {
        if (error?.code === 'P2002' || error?.code === 'P2034') return null;
        throw error;
      });
      if (!outcome) continue;

      this.logger.log(
        `Auto-dispatch: offered job ${deliveryJobId} to ${
          candidate.rider.name || candidate.rider.id
        } (${outcome.distanceKm} km away)`,
      );
      return outcome;
    }

    return {
      deliveryJobId,
      offered: false,
      reason: 'CONCURRENT_CHANGE',
    };
  }

  private async offerCandidate(input: {
    deliveryJobId: string;
    riderProfileId: string;
    riderUserId: string;
    expectedStoreLat: number;
    expectedStoreLng: number;
    expectedStoreId: string;
    locationFreshAfter: Date;
    maxPickupKm: number;
  }): Promise<AutoDispatchOutcome | null> {
    return prisma.$transaction(
      async (tx) => {
        const currentJob = await tx.deliveryJob.findUnique({
          where: { id: input.deliveryJobId },
          select: { status: true, currentRiderId: true, order: { select: { storeId: true } } },
        });
        if (
          !currentJob ||
          currentJob.status !== DeliveryJobStatus.WAITING_FOR_DISPATCH ||
          currentJob.currentRiderId
        ) {
          return null;
        }

        const competingAssignment = await tx.dispatchAssignment.findFirst({
          where: {
            deliveryJobId: input.deliveryJobId,
            status: {
              in: [
                DispatchAssignmentStatus.OFFERED,
                DispatchAssignmentStatus.ACCEPTED,
              ],
            },
          },
          select: { id: true },
        });
        if (competingAssignment) return null;

        const rider = await tx.riderProfile.findUnique({
          where: { id: input.riderProfileId },
          select: { id: true, userId: true, status: true },
        });
        if (!rider || !['ONLINE', 'BUSY'].includes(rider.status)) return null;

        const locations = await tx.$queryRaw<Array<{
          latitude: number;
          longitude: number;
          capturedAt: Date;
        }>>(Prisma.sql`
          SELECT "latitude", "longitude", "capturedAt"
          FROM "RiderAvailabilityLocation"
          WHERE "riderProfileId" = ${rider.id}
          FOR UPDATE
        `);
        const location = locations[0];
        if (!location || location.capturedAt < input.locationFreshAfter) {
          return null;
        }

        // Candidate eligibility and the partial unique index must agree.
        // Reconcile expired OFFERED rows while this Rider's availability row is
        // locked, then check for a genuinely live offer before inserting.
        const offerCheckAt = new Date();
        const expiredOffers = await tx.dispatchAssignment.findMany({
          where: {
            riderProfileId: rider.id,
            status: DispatchAssignmentStatus.OFFERED,
            expiresAt: { lt: offerCheckAt },
          },
          select: {
            id: true,
            deliveryJobId: true,
            riderProfileId: true,
            expiresAt: true,
          },
        });
        for (const expiredOffer of expiredOffers) {
          const changed = await tx.dispatchAssignment.updateMany({
            where: {
              id: expiredOffer.id,
              status: DispatchAssignmentStatus.OFFERED,
              expiresAt: { lt: offerCheckAt },
            },
            data: {
              status: DispatchAssignmentStatus.EXPIRED,
              respondedAt: offerCheckAt,
            },
          });
          if (changed.count !== 1) continue;
          await this.events.record(
            {
              deliveryJobId: expiredOffer.deliveryJobId,
              assignmentId: expiredOffer.id,
              eventType: DeliveryEventType.ASSIGNMENT_EXPIRED,
              actor: { id: null, role: Role.ADMIN },
              metadata: {
                source: 'AUTO_DISPATCH_CANDIDATE_RECONCILER',
                riderProfileId: expiredOffer.riderProfileId,
                expiresAt: expiredOffer.expiresAt?.toISOString() || null,
              },
            },
            tx,
          );
        }

        const activeJobs = await tx.deliveryJob.findMany({
          where: {
            currentRiderId: rider.id,
            status: { in: ACTIVE_JOB_STATUSES as any },
          },
          select: { id: true, status: true, order: { select: { storeId: true } } },
        });
        const otherOpenOffer = await tx.dispatchAssignment.findFirst({
          where: {
            deliveryJobId: { not: input.deliveryJobId },
            riderProfileId: rider.id,
            status: DispatchAssignmentStatus.OFFERED,
            OR: [{ expiresAt: null }, { expiresAt: { gt: offerCheckAt } }],
          },
          select: { id: true },
        });
        const incompatibleJob = activeJobs.find((activeJob) =>
          activeJob.order.storeId !== input.expectedStoreId ||
          ![
            DeliveryJobStatus.RIDER_ASSIGNED,
            DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
            DeliveryJobStatus.RIDER_AT_STORE,
          ].includes(activeJob.status as any)
        );
        if (
          incompatibleJob ||
          otherOpenOffer ||
          (rider.status === 'BUSY' && activeJobs.length === 0)
        ) return null;

        const currentDistance = calculateDistance(
          input.expectedStoreLat,
          input.expectedStoreLng,
          location.latitude,
          location.longitude,
        );
        if (currentDistance > input.maxPickupKm) return null;

        const distanceKm = Math.round(currentDistance * 10) / 10;
        const offeredAt = new Date();
        const assignment = await tx.dispatchAssignment.create({
          data: {
            deliveryJobId: input.deliveryJobId,
            riderProfileId: rider.id,
            status: DispatchAssignmentStatus.OFFERED,
            offeredAt,
            expiresAt: new Date(
              offeredAt.getTime() + this.offerExpirySeconds() * 1000,
            ),
            createdByUserId: null,
          },
        });

        await this.events.record(
          {
            deliveryJobId: input.deliveryJobId,
            assignmentId: assignment.id,
            eventType: DeliveryEventType.ASSIGNMENT_CREATED,
            actor: { id: null, role: Role.ADMIN },
            metadata: {
              riderProfileId: rider.id,
              riderUserId: rider.userId,
              distanceKm,
              autoDispatch: true,
            },
          },
          tx,
        );
        await this.events.record(
          {
            deliveryJobId: input.deliveryJobId,
            assignmentId: assignment.id,
            eventType: DeliveryEventType.ASSIGNMENT_OFFERED,
            actor: { id: null, role: Role.ADMIN },
            metadata: {
              riderProfileId: rider.id,
              riderUserId: rider.userId,
              distanceKm,
              maxPickupKm: input.maxPickupKm,
              locationFreshAfter: input.locationFreshAfter.toISOString(),
              expiresInSeconds: this.offerExpirySeconds(),
              autoDispatch: true,
            },
          },
          tx,
        );

        return {
          deliveryJobId: input.deliveryJobId,
          offered: true,
          reason: 'OFFERED',
          assignmentId: assignment.id,
          riderProfileId: rider.id,
          riderUserId: rider.userId,
          distanceKm,
        };
      },
      { isolationLevel: 'Serializable' as any },
    );
  }
}
