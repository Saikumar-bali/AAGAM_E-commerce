import { Injectable, Logger } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
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

const OFFER_EXPIRY_SECONDS = 60;

@Injectable()
export class AutoDispatchService {
  private readonly logger = new Logger(AutoDispatchService.name);

  constructor(private readonly events: DeliveryEventService) {}

  private isEnabled() {
    const configured = process.env.AUTO_DISPATCH_ENABLED?.trim().toLowerCase();
    if (configured) return configured === 'true';

    // E2E and unit suites exercise the manual dispatch flow with seeded riders.
    // Keep that flow deterministic unless a test explicitly opts into auto-dispatch.
    return process.env.NODE_ENV !== 'test';
  }

  async dispatchNearestRider(deliveryJobId: string): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug(`Auto-dispatch disabled for job ${deliveryJobId}`);
      return;
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

    if (!job) return;
    if (job.status !== DeliveryJobStatus.WAITING_FOR_DISPATCH) return;
    if (!Number.isFinite(job.order.store.latitude) || !Number.isFinite(job.order.store.longitude)) {
      this.logger.warn(`Store ${job.order.storeId} has no valid coordinates — skipping auto-dispatch for job ${deliveryJobId}`);
      return;
    }

    const storeLat = job.order.store.latitude;
    const storeLng = job.order.store.longitude;

    const activeAssignment = await prisma.dispatchAssignment.findFirst({
      where: {
        deliveryJobId,
        status: { in: [DispatchAssignmentStatus.OFFERED, DispatchAssignmentStatus.ACCEPTED] },
      },
      select: { id: true },
    });
    if (activeAssignment) return;

    const previouslyTriedRiderIds = (
      await prisma.dispatchAssignment.findMany({
        where: { deliveryJobId },
        select: { riderProfileId: true },
      })
    ).map((assignment) => assignment.riderProfileId);

    const candidates = await prisma.riderProfile.findMany({
      where: {
        status: 'ONLINE' as any,
        latitude: { not: null },
        longitude: { not: null },
        id: { notIn: previouslyTriedRiderIds },
      },
      include: { user: { select: { id: true, name: true } } },
    });

    if (candidates.length === 0) {
      this.logger.log(`No eligible riders for auto-dispatch on job ${deliveryJobId}`);
      return;
    }

    const busyRiderIds = new Set(
      (
        await prisma.deliveryJob.findMany({
          where: {
            currentRiderId: { in: candidates.map((candidate) => candidate.id) },
            status: { in: ACTIVE_JOB_STATUSES as any },
          },
          select: { currentRiderId: true },
        })
      )
        .map((activeJob) => activeJob.currentRiderId)
        .filter((riderId): riderId is string => Boolean(riderId)),
    );

    const eligible = candidates.filter((candidate) => !busyRiderIds.has(candidate.id));
    if (eligible.length === 0) {
      this.logger.log(`All nearby riders are busy — no auto-dispatch for job ${deliveryJobId}`);
      return;
    }

    const withDistance = eligible.map((rider) => ({
      rider,
      distanceKm: calculateDistance(storeLat, storeLng, rider.latitude!, rider.longitude!),
    }));
    withDistance.sort((left, right) => left.distanceKm - right.distanceKm);

    const nearest = withDistance[0].rider;
    const distanceKm = Math.round(withDistance[0].distanceKm * 10) / 10;

    this.logger.log(`Auto-dispatch: offering job ${deliveryJobId} to ${nearest.user?.name || nearest.id} (${distanceKm} km away)`);

    await prisma.$transaction(async (tx) => {
      const currentJob = await tx.deliveryJob.findUnique({
        where: { id: deliveryJobId },
        select: { status: true, currentRiderId: true },
      });
      if (
        !currentJob ||
        currentJob.status !== DeliveryJobStatus.WAITING_FOR_DISPATCH ||
        currentJob.currentRiderId
      ) {
        return;
      }

      const competingAssignment = await tx.dispatchAssignment.findFirst({
        where: {
          deliveryJobId,
          status: { in: [DispatchAssignmentStatus.OFFERED, DispatchAssignmentStatus.ACCEPTED] },
        },
        select: { id: true },
      });
      if (competingAssignment) return;

      const now = new Date();
      const assignment = await tx.dispatchAssignment.create({
        data: {
          deliveryJobId,
          riderProfileId: nearest.id,
          status: DispatchAssignmentStatus.OFFERED,
          offeredAt: now,
          expiresAt: new Date(now.getTime() + OFFER_EXPIRY_SECONDS * 1000),
          createdByUserId: null,
        },
      });

      await this.events.record(
        {
          deliveryJobId,
          assignmentId: assignment.id,
          eventType: DeliveryEventType.ASSIGNMENT_CREATED,
          actor: { id: null, role: Role.ADMIN },
          metadata: { riderProfileId: nearest.id, riderUserId: nearest.userId, distanceKm, autoDispatch: true },
        },
        tx,
      );

      await this.events.record(
        {
          deliveryJobId,
          assignmentId: assignment.id,
          eventType: DeliveryEventType.ASSIGNMENT_OFFERED,
          actor: { id: null, role: Role.ADMIN },
          metadata: { riderProfileId: nearest.id, riderUserId: nearest.userId, distanceKm, expiresInSeconds: OFFER_EXPIRY_SECONDS, autoDispatch: true },
        },
        tx,
      );
    });
  }
}
