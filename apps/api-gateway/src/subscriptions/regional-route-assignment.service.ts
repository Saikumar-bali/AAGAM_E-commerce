/**
 * Rider eligibility ranking and run assignment.
 *
 * Split out of the former regional-route-planning.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { DeliveryRouteEventType, DeliveryRunStatus, Prisma, RiderStatus, Role, RouteAssignmentSource, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { enqueueOutboxEvent } from '../notifications/outbox.service';
import { haversineKm } from './regional-routing.geometry';
import { RegionalRouteActor, RiderScore, ACTIVE_RUN_STATUSES, routeCode } from './regional-route-planning.shared';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';

@Injectable()
export class RegionalRouteAssignmentService {
  constructor(private readonly workflow: DeliveryWorkflowService) {}

  async rankEligibleRiders(runId: string): Promise<RiderScore[]> {
    const run = await prisma.deliveryRun.findUnique({
      where: { id: runId },
      include: { deliveryZone: { include: { preferredRiderLinks: true } }, store: true },
    });
    if (!run) return [];

    const requireShift = String(process.env.ROUTE_REQUIRE_SHIFT ?? 'true').toLowerCase() !== 'false';
    const now = new Date();
    const riders = await prisma.riderProfile.findMany({
      where: {
        approvalStatus: 'APPROVED',
        status: RiderStatus.ONLINE,
        user: { isActive: true },
      },
      include: {
        user: { select: { id: true, name: true, isActive: true } },
        availabilityLocation: true,
        shifts: {
          where: {
            startsAt: { lte: run.slotStart },
            endsAt: { gte: run.slotEnd },
            status: { in: ['SCHEDULED', 'ACTIVE'] },
          },
        },
        breaks: { where: { status: 'ACTIVE' } },
        documents: { where: { status: 'APPROVED' } },
        deliveryRuns: {
          where: {
            status: { in: ACTIVE_RUN_STATUSES },
            slotStart: { lt: run.slotEnd },
            slotEnd: { gt: run.slotStart },
            id: { not: run.id },
          },
          select: { id: true },
        },
        codLedgers: {
          where: { riderHoldingBalancePaise: { gt: 0 } },
          select: { riderHoldingBalancePaise: true },
        },
        cashDepositBatches: { where: { status: 'VARIANCE_REVIEW' }, select: { id: true } },
      },
    });

    const preferred = new Set(run.deliveryZone?.preferredRiderLinks.map((item) => item.riderProfileId) ?? []);
    const allowedVehicles = new Set((run.deliveryZone?.allowedVehicleTypes ?? []).map((item) => item.toUpperCase()));
    const maxPickupDistanceKm = Math.max(1, Number(process.env.ROUTE_RIDER_MAX_PICKUP_DISTANCE_KM || 25));
    const scores: RiderScore[] = [];

    for (const rider of riders) {
      const location = rider.availabilityLocation
        ? { latitude: rider.availabilityLocation.latitude, longitude: rider.availabilityLocation.longitude }
        : rider.latitude !== null && rider.longitude !== null
          ? { latitude: rider.latitude, longitude: rider.longitude }
          : null;
      if (!location) continue;
      if (requireShift && rider.shifts.length === 0) continue;
      if (rider.breaks.length || rider.deliveryRuns.length || rider.cashDepositBatches.length) continue;
      if (!rider.documents.some((document) => !document.expiresAt || document.expiresAt >= now)) continue;
      if (allowedVehicles.size && (!rider.vehicleType || !allowedVehicles.has(rider.vehicleType.toUpperCase()))) continue;
      if (run.expectedParcelCount > rider.maximumParcelCapacity) continue;

      const currentCashPaise = rider.codLedgers.reduce((sum, ledger) => sum + ledger.riderHoldingBalancePaise, 0);
      const allowedCashPaise = Math.min(
        rider.maximumCashHoldingPaise,
        run.deliveryZone?.cashRiskLimitPaise ?? rider.maximumCashHoldingPaise,
      );
      if (currentCashPaise + run.expectedCashPaise > allowedCashPaise) continue;

      const pickupDistanceKm = haversineKm(location, {
        latitude: run.store.latitude,
        longitude: run.store.longitude,
      });
      if (pickupDistanceKm > maxPickupDistanceKm) continue;

      const preferredZone = preferred.has(rider.id) || rider.homeZoneId === run.deliveryZoneId;
      const score = Math.round((pickupDistanceKm * 10 + currentCashPaise / 100_000 + (preferredZone ? -25 : 0)) * 100) / 100;
      const constraints: Prisma.JsonObject = {
        pickupDistanceKm: Math.round(pickupDistanceKm * 100) / 100,
        coveringShiftId: rider.shifts[0]?.id ?? null,
        vehicleType: rider.vehicleType,
        parcelCapacity: rider.maximumParcelCapacity,
        routeParcels: run.expectedParcelCount,
        routeWeightGrams: run.expectedWeightGrams,
        maximumRouteWeightGrams: run.deliveryZone?.maximumWeightKg == null ? null : Math.floor(run.deliveryZone.maximumWeightKg * 1000),
        currentCashPaise,
        routeCashPaise: run.expectedCashPaise,
        allowedCashPaise,
        preferredZone,
        unresolvedCashVariance: false,
      };
      scores.push({
        riderId: rider.id,
        userId: rider.user.id,
        score,
        summary: `${preferredZone ? 'Preferred-zone rider; ' : ''}${pickupDistanceKm.toFixed(1)} km from pickup; cash after assignment ₹${((currentCashPaise + run.expectedCashPaise) / 100).toLocaleString('en-IN')}`,
        constraints,
      });
    }

    return scores.sort((left, right) => left.score - right.score || left.riderId.localeCompare(right.riderId));
  }

  async assignBestEligibleRider(runId: string) {
    const selected = (await this.rankEligibleRiders(runId))[0];
    if (!selected) {
      return prisma.deliveryRun.update({
        where: { id: runId },
        data: {
          riderId: null,
          status: DeliveryRunStatus.RIDER_NEEDED,
          assignmentScoreVersion: 'regional-rider-score-v1',
          assignmentReasonSummary: 'No eligible rider satisfies zone, shift, vehicle, parcel/weight capacity, overlap, proximity, and cash-risk constraints',
          assignmentConstraints: { eligibleRiderCount: 0 },
          assignmentSource: RouteAssignmentSource.AUTOMATIC,
          version: { increment: 1 },
        },
      });
    }
    const actor = await prisma.user.findFirst({
      where: { role: Role.ADMIN, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true },
    });
    if (!actor) return null;
    return this.assignRider(runId, selected, actor, RouteAssignmentSource.AUTOMATIC);
  }

  async validateRiderForRunWithinTransaction(
    tx: Prisma.TransactionClient,
    runId: string,
    riderId: string,
  ): Promise<RiderScore> {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`regional-rider:${riderId}`}))`);
    const run = await tx.deliveryRun.findUnique({
      where: { id: runId },
      include: { deliveryZone: { include: { preferredRiderLinks: true } }, store: true },
    });
    if (!run) throw new BadRequestException('Delivery run not found');
    const rider = await tx.riderProfile.findUnique({
      where: { id: riderId },
      include: {
        user: { select: { id: true, name: true, isActive: true } },
        availabilityLocation: true,
        shifts: {
          where: {
            startsAt: { lte: run.slotStart },
            endsAt: { gte: run.slotEnd },
            status: { in: ['SCHEDULED', 'ACTIVE'] },
          },
        },
        breaks: { where: { status: 'ACTIVE' } },
        documents: { where: { status: 'APPROVED' } },
        deliveryRuns: {
          where: {
            status: { in: ACTIVE_RUN_STATUSES },
            slotStart: { lt: run.slotEnd },
            slotEnd: { gt: run.slotStart },
            id: { not: run.id },
          },
          select: { id: true },
        },
        codLedgers: {
          where: { riderHoldingBalancePaise: { gt: 0 } },
          select: { riderHoldingBalancePaise: true },
        },
        cashDepositBatches: { where: { status: 'VARIANCE_REVIEW' }, select: { id: true } },
      },
    });
    if (!rider || !rider.user.isActive || rider.approvalStatus !== 'APPROVED' || rider.status !== RiderStatus.ONLINE) {
      throw new BadRequestException('Requested rider is not active, approved, and online');
    }
    const requireShift = String(process.env.ROUTE_REQUIRE_SHIFT ?? 'true').toLowerCase() !== 'false';
    if (requireShift && !rider.shifts.length) throw new BadRequestException('Requested rider has no covering shift');
    if (rider.breaks.length) throw new BadRequestException('Requested rider is on an active break');
    if (rider.deliveryRuns.length) throw new BadRequestException('Requested rider has an overlapping delivery run');
    if (rider.cashDepositBatches.length) throw new BadRequestException('Requested rider has unresolved cash variance');
    const now = new Date();
    if (!rider.documents.some((document) => !document.expiresAt || document.expiresAt >= now)) {
      throw new BadRequestException('Requested rider has no active approved document');
    }
    const preferred = new Set(run.deliveryZone?.preferredRiderLinks.map((item) => item.riderProfileId) ?? []);
    if (rider.homeZoneId && run.deliveryZoneId && rider.homeZoneId !== run.deliveryZoneId && !preferred.has(rider.id)) {
      throw new BadRequestException('Requested rider is outside the run delivery zone');
    }
    const allowedVehicles = new Set((run.deliveryZone?.allowedVehicleTypes ?? []).map((item) => item.toUpperCase()));
    if (allowedVehicles.size && (!rider.vehicleType || !allowedVehicles.has(rider.vehicleType.toUpperCase()))) {
      throw new BadRequestException('Requested rider vehicle is not allowed for this zone');
    }
    if (run.expectedParcelCount > rider.maximumParcelCapacity) throw new BadRequestException('Requested rider parcel capacity is insufficient');
    const maximumWeightGrams = run.deliveryZone?.maximumWeightKg == null ? null : Math.floor(run.deliveryZone.maximumWeightKg * 1000);
    if (maximumWeightGrams !== null && run.expectedWeightGrams > maximumWeightGrams) {
      throw new BadRequestException('Route exceeds the delivery-zone weight limit');
    }
    const currentCashPaise = rider.codLedgers.reduce((sum, ledger) => sum + ledger.riderHoldingBalancePaise, 0);
    const allowedCashPaise = Math.min(
      rider.maximumCashHoldingPaise,
      run.deliveryZone?.cashRiskLimitPaise ?? rider.maximumCashHoldingPaise,
    );
    if (currentCashPaise + run.expectedCashPaise > allowedCashPaise) throw new BadRequestException('Requested rider cash exposure would exceed the limit');
    const location = rider.availabilityLocation
      ? { latitude: rider.availabilityLocation.latitude, longitude: rider.availabilityLocation.longitude }
      : rider.latitude !== null && rider.longitude !== null
        ? { latitude: rider.latitude, longitude: rider.longitude }
        : null;
    if (!location) throw new BadRequestException('Requested rider has no authoritative availability location');
    const pickupDistanceKm = haversineKm(location, { latitude: run.store.latitude, longitude: run.store.longitude });
    const maxPickupDistanceKm = Math.max(1, Number(process.env.ROUTE_RIDER_MAX_PICKUP_DISTANCE_KM || 25));
    if (pickupDistanceKm > maxPickupDistanceKm) throw new BadRequestException('Requested rider is too far from pickup');
    const preferredZone = preferred.has(rider.id) || rider.homeZoneId === run.deliveryZoneId;
    const score = Math.round((pickupDistanceKm * 10 + currentCashPaise / 100_000 + (preferredZone ? -25 : 0)) * 100) / 100;
    return {
      riderId: rider.id,
      userId: rider.user.id,
      score,
      summary: `${preferredZone ? 'Preferred-zone rider; ' : ''}${pickupDistanceKm.toFixed(1)} km from pickup; cash after assignment ₹${((currentCashPaise + run.expectedCashPaise) / 100).toLocaleString('en-IN')}`,
      constraints: {
        pickupDistanceKm: Math.round(pickupDistanceKm * 100) / 100,
        coveringShiftId: rider.shifts[0]?.id ?? null,
        vehicleType: rider.vehicleType,
        parcelCapacity: rider.maximumParcelCapacity,
        routeParcels: run.expectedParcelCount,
        routeWeightGrams: run.expectedWeightGrams,
        maximumRouteWeightGrams: maximumWeightGrams,
        currentCashPaise,
        routeCashPaise: run.expectedCashPaise,
        allowedCashPaise,
        preferredZone,
        unresolvedCashVariance: false,
      },
    };
  }

  async assignRiderWithinTransaction(
    tx: Prisma.TransactionClient,
    runId: string,
    riderId: string,
    actor: RegionalRouteActor,
    source: RouteAssignmentSource,
    reasonPrefix?: string,
  ) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`regional-route-assign:${runId}`}))`);
    const run = await tx.deliveryRun.findUnique({
      where: { id: runId },
      include: { stops: { include: { deliveryJob: true } } },
    });
    if (!run) return null;
    if (run.riderId === riderId && run.stops.every((stop) => stop.deliveryJob.currentRiderId === riderId)) {
      return run;
    }
    const selected = await this.validateRiderForRunWithinTransaction(tx, runId, riderId);
    const summary = reasonPrefix ? `${reasonPrefix}; ${selected.summary}` : selected.summary;
    const previousRiderId = run.riderId;
    const previousRider = previousRiderId && previousRiderId !== selected.riderId
      ? await tx.riderProfile.findUnique({ where: { id: previousRiderId }, select: { userId: true } })
      : null;

    for (const stop of run.stops) {
      if (stop.deliveryJob.status === DeliveryJobStatus.WAITING_FOR_DISPATCH) {
        await this.workflow.transitionWithinTransaction(
          tx,
          stop.deliveryJobId,
          DeliveryJobStatus.RIDER_ASSIGNED,
          actor,
          {
            expectedStatus: DeliveryJobStatus.WAITING_FOR_DISPATCH,
            assignedRiderId: selected.riderId,
            skipRoleCheck: true,
            metadata: { deliveryRunId: run.id, routeCode: run.routeCode, assignmentSource: source },
          },
        );
      } else if (stop.deliveryJob.currentRiderId !== selected.riderId) {
        await tx.deliveryJob.update({
          where: { id: stop.deliveryJobId },
          data: { currentRiderId: selected.riderId, version: { increment: 1 } },
        });
        await tx.deliveryEvent.create({
          data: {
            deliveryJobId: stop.deliveryJobId,
            eventType: 'ASSIGNMENT_REASSIGNED',
            actorUserId: actor.id,
            actorRole: actor.role,
            metadata: {
              fromRiderId: stop.deliveryJob.currentRiderId,
              toRiderId: selected.riderId,
              deliveryRunId: run.id,
            },
          },
        });
      }
      await tx.subscriptionDelivery.update({
        where: { id: stop.subscriptionDeliveryId },
        data: { status: SubscriptionDeliveryStatus.ASSIGNED },
      });
    }

    const updated = await tx.deliveryRun.update({
      where: { id: run.id },
      data: {
        riderId: selected.riderId,
        status: DeliveryRunStatus.PLANNED,
        assignmentScoreVersion: 'regional-rider-score-v2',
        assignmentReasonSummary: summary,
        assignmentConstraints: selected.constraints,
        assignmentSource: source,
        version: { increment: 1 },
      },
      include: { deliveryZone: true, rider: { include: { user: true } }, stops: true },
    });
    await tx.deliveryRunAuditEntry.create({
      data: {
        deliveryRunId: run.id,
        actorUserId: actor.id,
        actorRole: actor.role,
        action: previousRiderId ? 'DELIVERY_RUN_REASSIGNED' : 'DELIVERY_RUN_ASSIGNED',
        reason: summary,
        metadata: {
          previousRiderId,
          riderId: selected.riderId,
          score: selected.score,
          source,
          constraints: selected.constraints,
        } as Prisma.InputJsonValue,
        idempotencyKey: `route-assigned:${run.id}:v${updated.version}:${selected.riderId}`,
      },
    });
    await tx.deliveryRouteEvent.create({
      data: {
        eventType: previousRiderId
          ? DeliveryRouteEventType.DELIVERY_RUN_REASSIGNED
          : DeliveryRouteEventType.DELIVERY_RUN_ASSIGNED,
        deliveryRunId: run.id,
        actorUserId: actor.id,
        payload: {
          previousRiderId,
          riderId: selected.riderId,
          routeCode: run.routeCode,
          source,
          reason: summary,
        },
        dedupeKey: `route-assignment-event:${run.id}:v${updated.version}`,
      },
    });
    if (previousRider?.userId && previousRider.userId !== selected.userId) {
      await enqueueOutboxEvent(tx, {
        eventType: 'ROUTE_REMOVED',
        aggregateType: 'SYSTEM',
        aggregateId: run.id,
        idempotencyKey: `route-removed:${run.id}:v${updated.version}:${previousRider.userId}`,
        payload: {
          riderUserId: previousRider.userId,
          deepLink: '/rider/routes',
          metadata: { deliveryRunId: run.id, routeCode: run.routeCode, reason: summary },
        },
      });
    }
    await enqueueOutboxEvent(tx, {
      eventType: 'ROUTE_ASSIGNED',
      aggregateType: 'SYSTEM',
      aggregateId: run.id,
      idempotencyKey: `route-assigned-notification:${run.id}:v${updated.version}:${selected.userId}`,
      payload: {
        riderUserId: selected.userId,
        deepLink: '/rider/routes',
        metadata: { deliveryRunId: run.id, routeCode: run.routeCode, source },
      },
    });
    return updated;
  }

  async assignRider(
    runId: string,
    selected: RiderScore,
    actor: RegionalRouteActor,
    source: RouteAssignmentSource,
  ) {
    return prisma.$transaction(
      (tx) => this.assignRiderWithinTransaction(tx, runId, selected.riderId, actor, source),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
