import { Injectable, Logger } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import {
  DeliveryEventType,
  DeliveryJobStatus,
  DispatchAssignmentStatus,
} from '@aagam/types';
import { calculateDistance } from '@aagam/utils';
import { DeliveryEventService } from './delivery-event.service';

type Actor = { id: string; role: Role };

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

  /**
   * Find the nearest eligible rider to the store and send them an offer.
   * If no eligible riders exist, the job stays in WAITING_FOR_DISPATCH
   * for manual dispatch.
   */
  async dispatchNearestRider(deliveryJobId: string): Promise<void> {
    const job = await prisma.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      include: {
        order: {
          include: {
            store: {
              select: { id: true, latitude: true, longitude: true },
            },
          },
        },
      },
    });

    if (!job) return;
    if (job.status !== DeliveryJobStatus.WAITING_FOR_DISPATCH) return;
    if (!job.order.store.latitude || !job.order.store.longitude) {
      this.logger.warn(
        `Store ${job.order.storeId} has no coordinates — skipping auto-dispatch for job ${deliveryJobId}`,
      );
      return;
    }

    const storeLat = job.order.store.latitude;
    const storeLng = job.order.store.longitude;

    // Riders already offered or accepted for this job.
    const existingAssignmentRiderIds = (
      await prisma.dispatchAssignment.findMany({
        where: {
          deliveryJobId,
          status: {
            in: [
              DispatchAssignmentStatus.OFFERED,
              DispatchAssignmentStatus.ACCEPTED,
            ],
          },
        },
        select: { riderProfileId: true },
      })
    ).map((a) => a.riderProfileId);

    // All ONLINE riders with known location, excluding those already offered.
    const candidates = await prisma.riderProfile.findMany({
      where: {
        status: 'ONLINE' as any,
        latitude: { not: null },
        longitude: { not: null },
        id: { notIn: existingAssignmentRiderIds },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (candidates.length === 0) {
      this.logger.log(
        `No eligible riders for auto-dispatch on job ${deliveryJobId}`,
      );
      return;
    }

    // Exclude riders who already have an active delivery job.
    const busyRiderIds = (
      await prisma.deliveryJob.findMany({
        where: {
          currentRiderId: { in: candidates.map((c) => c.id) },
          status: { in: ACTIVE_JOB_STATUSES as any },
        },
        select: { currentRiderId: true },
      })
    ).map((j) => j.currentRiderId);

    const eligible = candidates.filter((c) => !busyRiderIds.includes(c.id));

    if (eligible.length === 0) {
      this.logger.log(
        `All nearby riders are busy — no auto-dispatch for job ${deliveryJobId}`,
      );
      return;
    }

    // Sort by distance from store (nearest first).
    const withDistance = eligible.map((rider) => ({
      rider,
      distanceKm: calculateDistance(
        storeLat,
        storeLng,
        rider.latitude!,
        rider.longitude!,
      ),
    }));
    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    const nearest = withDistance[0].rider;
    const distanceKm = Math.round(withDistance[0].distanceKm * 10) / 10;

    this.logger.log(
      `Auto-dispatch: offering job ${deliveryJobId} to ${nearest.user?.name || nearest.id} (${distanceKm} km away)`,
    );

    const now = new Date();
    const assignment = await prisma.dispatchAssignment.create({
      data: {
        deliveryJobId,
        riderProfileId: nearest.id,
        status: DispatchAssignmentStatus.OFFERED,
        offeredAt: now,
        expiresAt: new Date(now.getTime() + OFFER_EXPIRY_SECONDS * 1000),
        createdByUserId: 'system-auto-dispatch',
      },
    });

    await this.events.record(
      {
        deliveryJobId,
        assignmentId: assignment.id,
        eventType: DeliveryEventType.ASSIGNMENT_CREATED,
        actor: { id: 'system-auto-dispatch', role: Role.ADMIN },
        metadata: {
          riderProfileId: nearest.id,
          riderUserId: nearest.userId,
          distanceKm,
          autoDispatch: true,
        },
      },
      prisma,
    );

    await this.events.record(
      {
        deliveryJobId,
        assignmentId: assignment.id,
        eventType: DeliveryEventType.ASSIGNMENT_OFFERED,
        actor: { id: 'system-auto-dispatch', role: Role.ADMIN },
        metadata: {
          riderProfileId: nearest.id,
          riderUserId: nearest.userId,
          distanceKm,
          expiresInSeconds: OFFER_EXPIRY_SECONDS,
          autoDispatch: true,
        },
      },
      prisma,
    );
  }
}
