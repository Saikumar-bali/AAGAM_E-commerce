/**
 * Shared route-operation loaders, guards, aggregates and constants.
 *
 * Split out of the former regional-route-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryRouteEventType, DeliveryRunStatus, DeliveryRunStopStatus, Prisma, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { createHash } from 'crypto';
import { GeoPoint, RouteCandidate, RouteConstraints, estimateRoute, nearestNeighbourOrder } from './regional-routing.geometry';
import { RegionalRouteActor } from './regional-route-planning.service';

export type Actor = RegionalRouteActor;
export type Tx = Prisma.TransactionClient;

export type EditableRun = Prisma.DeliveryRunGetPayload<{
  include: {
    deliveryZone: true;
    store: true;
    rider: { include: { user: true } };
    stops: {
      include: {
        deliveryJob: { include: { codLedger: true } };
        subscriptionDelivery: true;
      };
    };
  };
}>;

export const EDITABLE_RUN_STATUSES = new Set<DeliveryRunStatus>([
  DeliveryRunStatus.PLANNED,
  DeliveryRunStatus.RIDER_NEEDED,
]);
export const INTERRUPTIBLE_RUN_STATUSES = new Set<DeliveryRunStatus>([
  DeliveryRunStatus.READY_FOR_PICKUP,
  DeliveryRunStatus.PICKED_UP,
  DeliveryRunStatus.IN_PROGRESS,
]);
export const PROTECTED_STOP_STATUSES = new Set<DeliveryRunStopStatus>([
  DeliveryRunStopStatus.ARRIVED,
  DeliveryRunStopStatus.DELIVERED,
  DeliveryRunStopStatus.RETURNED,
]);
export const TERMINAL_STOP_STATUSES = new Set<DeliveryRunStopStatus>([
  DeliveryRunStopStatus.DELIVERED,
  DeliveryRunStopStatus.RETURNED,
  DeliveryRunStopStatus.CANCELLED,
]);
export const MOVABLE_JOB_STATUSES = new Set<string>([
  DeliveryJobStatus.WAITING_FOR_DISPATCH,
  DeliveryJobStatus.RIDER_ASSIGNED,
]);

export function digest(value: string, length = 8) {
  return createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase();
}

export function routeOrigin(run: EditableRun): GeoPoint {
  return { latitude: run.store.latitude, longitude: run.store.longitude };
}

export function candidateFromStop(stop: EditableRun['stops'][number]): RouteCandidate<EditableRun['stops'][number]> {
  const latitude = Number(stop.deliveryLatitude);
  const longitude = Number(stop.deliveryLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new BadRequestException(`Stop ${stop.sequenceNumber} is missing authoritative delivery coordinates`);
  }
  return {
    id: stop.id,
    latitude,
    longitude,
    parcelCount: stop.expectedParcelCount,
    cashDuePaise: stop.cashDuePaise,
    weightGrams: stop.expectedWeightGrams,
    value: stop,
  };
}

export function safeRouteEventMessage(eventType: DeliveryRouteEventType) {
  const assignmentEvents = new Set<DeliveryRouteEventType>([
    DeliveryRouteEventType.DELIVERY_RUN_ASSIGNED,
    DeliveryRouteEventType.DELIVERY_RUN_REASSIGNED,
  ]);
  const orderEvents = new Set<DeliveryRouteEventType>([
    DeliveryRouteEventType.DELIVERY_RUN_SPLIT,
    DeliveryRouteEventType.DELIVERY_RUN_MERGED,
    DeliveryRouteEventType.RUN_STOP_MOVED,
    DeliveryRouteEventType.RUN_STOP_REORDERED,
  ]);
  const recoveryEvents = new Set<DeliveryRouteEventType>([
    DeliveryRouteEventType.DELIVERY_RUN_INTERRUPTED,
    DeliveryRouteEventType.RECOVERY_RUN_CREATED,
  ]);
  if (assignmentEvents.has(eventType)) return 'Your assigned delivery route changed. Refresh before continuing.';
  if (orderEvents.has(eventType)) return 'The route stop list changed. Refresh to load the safe current order.';
  if (recoveryEvents.has(eventType)) return 'A recovery route update is available. Refresh before continuing.';
  if (eventType === DeliveryRouteEventType.DELIVERY_RUN_CANCELLED) return 'This route was cancelled or replanned.';
  return 'Delivery route information was updated.';
}

export class RegionalRouteOperationsServiceBase {
  protected async run(id: string): Promise<EditableRun> {
    const run = await prisma.deliveryRun.findUnique({
      where: { id },
      include: {
        deliveryZone: true,
        store: true,
        rider: { include: { user: true } },
        stops: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            deliveryJob: { include: { codLedger: true } },
            subscriptionDelivery: true,
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Delivery run not found');
    return run;
  }

  protected assertVersion(run: EditableRun, version: number) {
    if (run.version !== version) throw new ConflictException('Delivery run changed; refresh and try again');
  }

  protected assertEditable(run: EditableRun) {
    if (!EDITABLE_RUN_STATUSES.has(run.status)) {
      throw new BadRequestException(`Run ${run.routeCode} cannot be changed from ${run.status}`);
    }
    if (run.packingConfirmedAt || run.storeHandoffConfirmedAt || run.pickupConfirmedAt || run.startedAt) {
      throw new BadRequestException('Only unstarted and unpacked routes may be manually reorganised');
    }
    const protectedStop = run.stops.find((stop) =>
      PROTECTED_STOP_STATUSES.has(stop.status)
      || Number(stop.deliveryJob.codLedger?.collectedAmountPaise || 0) > 0,
    );
    if (protectedStop) {
      throw new BadRequestException(`Stop ${protectedStop.sequenceNumber} already has protected operational or cash history`);
    }
  }

  protected constraints(run: EditableRun, maximumStops?: number): RouteConstraints {
    const zone = run.deliveryZone;
    return {
      maximumStops: Math.max(1, maximumStops ?? zone?.maximumStopsPerRun ?? 15),
      maximumParcels: Math.max(1, zone?.maximumParcelCount ?? 50),
      maximumCashPaise: Math.max(0, zone?.cashRiskLimitPaise ?? 1_000_000),
      maximumDistanceKm: Math.max(0.1, zone?.maximumRouteDistanceKm ?? 30),
      maximumDurationMinutes: Math.max(1, Math.min(
        zone?.maximumEstimatedDurationMinutes ?? 120,
        Math.max(1, Math.floor((run.slotEnd.getTime() - run.slotStart.getTime()) / 60_000) - (zone?.slotEndBufferMinutes ?? 0)),
      )),
      maximumWeightGrams: zone?.maximumWeightKg ? Math.floor(zone.maximumWeightKg * 1000) : undefined,
      averageSpeedKph: Math.max(5, Number(process.env.ROUTE_AVERAGE_SPEED_KPH || 22)),
      serviceMinutesPerStop: Math.max(1, Number(process.env.ROUTE_SERVICE_MINUTES_PER_STOP || 5)),
    };
  }

  protected assertCapacity(run: EditableRun, candidates: RouteCandidate<unknown>[]) {
    const constraints = this.constraints(run);
    const estimate = estimateRoute(routeOrigin(run), nearestNeighbourOrder(routeOrigin(run), candidates), constraints);
    const parcels = candidates.reduce((sum, item) => sum + item.parcelCount, 0);
    const cash = candidates.reduce((sum, item) => sum + item.cashDuePaise, 0);
    const weightGrams = candidates.reduce((sum, item) => sum + (item.weightGrams ?? 0), 0);
    if (
      candidates.length > constraints.maximumStops
      || parcels > constraints.maximumParcels
      || cash > constraints.maximumCashPaise
      || (constraints.maximumWeightGrams !== undefined && weightGrams > constraints.maximumWeightGrams)
      || estimate.distanceKm > constraints.maximumDistanceKm
      || estimate.durationMinutes > constraints.maximumDurationMinutes
    ) {
      throw new BadRequestException('Route would exceed stop, parcel, weight, cash, distance, or slot capacity');
    }
  }

  protected async resetPendingJobOwnership(
    tx: Tx,
    stop: EditableRun['stops'][number],
    riderId: string | null,
  ) {
    if (!MOVABLE_JOB_STATUSES.has(stop.deliveryJob.status)) {
      throw new BadRequestException(`Delivery job for stop ${stop.sequenceNumber} is no longer movable`);
    }
    await tx.deliveryJob.update({
      where: { id: stop.deliveryJobId },
      data: {
        currentRiderId: riderId,
        status: riderId ? DeliveryJobStatus.RIDER_ASSIGNED : DeliveryJobStatus.WAITING_FOR_DISPATCH,
        version: { increment: 1 },
      },
    });
    await tx.subscriptionDelivery.update({
      where: { id: stop.subscriptionDeliveryId },
      data: { status: riderId ? SubscriptionDeliveryStatus.ASSIGNED : SubscriptionDeliveryStatus.ORDER_GENERATED },
    });
  }

  protected async recalculate(tx: Tx, runId: string) {
    const run = await tx.deliveryRun.findUnique({
      where: { id: runId },
      include: { store: true, stops: { orderBy: { sequenceNumber: 'asc' } } },
    });
    if (!run) return;
    const candidates = run.stops.flatMap((stop) => {
      const latitude = Number(stop.deliveryLatitude);
      const longitude = Number(stop.deliveryLongitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{
            id: stop.id,
            latitude,
            longitude,
            parcelCount: stop.expectedParcelCount,
            cashDuePaise: stop.cashDuePaise,
            weightGrams: stop.expectedWeightGrams,
            value: stop,
          }]
        : [];
    });
    const estimate = estimateRoute(
      { latitude: run.store.latitude, longitude: run.store.longitude },
      candidates,
      {
        averageSpeedKph: Number(process.env.ROUTE_AVERAGE_SPEED_KPH || 22),
        serviceMinutesPerStop: Number(process.env.ROUTE_SERVICE_MINUTES_PER_STOP || 5),
      },
    );
    await tx.deliveryRun.update({
      where: { id: run.id },
      data: {
        totalStopCount: run.stops.length,
        completedStopCount: run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.DELIVERED).length,
        failedStopCount: run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.FAILED).length,
        retryPendingStopCount: run.stops.filter((stop) => stop.status === DeliveryRunStopStatus.RETRY_PENDING).length,
        expectedCashPaise: run.stops.reduce((sum, stop) => sum + stop.cashDuePaise, 0),
        expectedParcelCount: run.stops.reduce((sum, stop) => sum + stop.expectedParcelCount, 0),
        expectedBagCount: run.stops.reduce((sum, stop) => sum + stop.expectedParcelCount, 0),
        expectedItemCount: run.stops.reduce((sum, stop) => sum + stop.expectedItemCount, 0),
        expectedWeightGrams: run.stops.reduce((sum, stop) => sum + stop.expectedWeightGrams, 0),
        estimatedDistanceKm: estimate.distanceKm,
        estimatedDurationMinutes: estimate.durationMinutes,
      },
    });
  }

  protected async audit(tx: Tx, input: {
    runId: string;
    actor: Actor;
    action: string;
    reason: string;
    sourceRunId?: string;
    destinationRunId?: string;
    stopId?: string;
    metadata: Prisma.InputJsonValue;
    eventType: DeliveryRouteEventType;
    dedupeKey: string;
  }) {
    await tx.deliveryRunAuditEntry.create({
      data: {
        deliveryRunId: input.runId,
        actorUserId: input.actor.id,
        actorRole: input.actor.role,
        action: input.action,
        reason: input.reason,
        sourceRunId: input.sourceRunId,
        destinationRunId: input.destinationRunId,
        metadata: input.metadata,
        idempotencyKey: input.dedupeKey,
      },
    });
    await tx.deliveryRouteEvent.create({
      data: {
        eventType: input.eventType,
        deliveryRunId: input.runId,
        deliveryRunStopId: input.stopId,
        actorUserId: input.actor.id,
        payload: input.metadata,
        dedupeKey: `event:${input.dedupeKey}`,
      },
    });
  }
}
