import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DeliveryRouteEventType,
  DeliveryRunStatus,
  DeliveryRunStopStatus,
  DeliveryZone,
  DeliveryZoneResolutionSource,
  Prisma,
  RiderStatus,
  Role,
  RouteAssignmentSource,
  SubscriptionDeliveryStatus,
  prisma,
} from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { createHash } from 'crypto';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { enqueueOutboxEvent } from '../notifications/outbox.service';
import { RegionalDeliveryZoneService } from './regional-delivery-zone.service';
import {
  GeoPoint,
  RouteCandidate,
  RouteConstraints,
  estimateRoute,
  haversineKm,
  splitByOperationalConstraints,
} from './regional-routing.geometry';

type PlanningDelivery = Prisma.SubscriptionDeliveryGetPayload<{
  include: {
    subscription: { include: { address: true } };
    order: { include: { items: true; payment: true } };
    store: true;
  };
}>;

type ResolvedDelivery = {
  delivery: PlanningDelivery;
  zone: DeliveryZone;
  point: GeoPoint;
  window: { start: Date; end: Date };
  handlingRequirement: string;
  vehicleRequirement: string;
  paymentRequirement: string;
  weightGrams: number;
};

export type RegionalRouteActor = { id: string; role: Role };

export type RiderScore = {
  riderId: string;
  userId: string;
  score: number;
  summary: string;
  constraints: Prisma.JsonObject;
};

const ACTIVE_RUN_STATUSES = [
  DeliveryRunStatus.PLANNED,
  DeliveryRunStatus.RIDER_NEEDED,
  DeliveryRunStatus.READY_FOR_PICKUP,
  DeliveryRunStatus.PICKED_UP,
  DeliveryRunStatus.IN_PROGRESS,
  DeliveryRunStatus.RETURNING,
  DeliveryRunStatus.AWAITING_SETTLEMENT,
  DeliveryRunStatus.RECOVERY_REQUIRED,
];

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function textFromJson(value: Prisma.JsonValue | undefined, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : fallback;
}

function routeHash(value: string, length = 10) {
  return createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase();
}

function routeCode(serviceDate: Date, zoneCode: string, clusterIndex: number, fingerprint: string) {
  const date = serviceDate.toISOString().slice(0, 10).replaceAll('-', '');
  const safeZone = zoneCode.replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'ZONE';
  return `RUN-${safeZone}-${date}-${String(clusterIndex + 1).padStart(2, '0')}-${routeHash(fingerprint, 6)}`;
}

function policy(zone: DeliveryZone, window?: { start: Date; end: Date }): RouteConstraints {
  const slotMinutes = window ? Math.floor((window.end.getTime() - window.start.getTime()) / 60_000) : zone.maximumEstimatedDurationMinutes;
  const bufferedSlotMinutes = Math.max(1, slotMinutes - Math.max(0, zone.slotEndBufferMinutes));
  return {
    maximumStops: Math.max(1, zone.maximumStopsPerRun),
    maximumParcels: Math.max(1, zone.maximumParcelCount),
    maximumCashPaise: Math.max(0, zone.cashRiskLimitPaise),
    maximumWeightGrams: zone.maximumWeightKg == null ? undefined : Math.max(0, Math.floor(zone.maximumWeightKg * 1000)),
    maximumDistanceKm: Math.max(0.1, zone.maximumRouteDistanceKm),
    maximumDurationMinutes: Math.max(1, Math.min(zone.maximumEstimatedDurationMinutes, bufferedSlotMinutes)),
    averageSpeedKph: Math.max(5, Number(process.env.ROUTE_AVERAGE_SPEED_KPH || 22)),
    serviceMinutesPerStop: Math.max(1, Number(process.env.ROUTE_SERVICE_MINUTES_PER_STOP || 5)),
  };
}

function pointFor(delivery: PlanningDelivery): GeoPoint | null {
  const latitude = Number(delivery.order?.deliveryLat ?? delivery.subscription.address.latitude);
  const longitude = Number(delivery.order?.deliveryLng ?? delivery.subscription.address.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function hardConstraintFields(delivery: PlanningDelivery) {
  const rules = jsonRecord(delivery.subscription.policySnapshot);
  const items = Array.isArray(delivery.subscription.itemsSnapshot) ? delivery.subscription.itemsSnapshot : [];
  const firstItem = items.find((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, Prisma.JsonValue> | undefined;
  return {
    handlingRequirement: textFromJson(rules.temperatureRequirement ?? firstItem?.temperatureRequirement, 'STANDARD'),
    vehicleRequirement: textFromJson(rules.vehicleRequirement, 'ANY'),
    paymentRequirement: delivery.cashDuePaise > 0 ? 'CASH_COLLECTION' : 'SUBSCRIPTION_FUNDED',
  };
}

function weightForDelivery(delivery: PlanningDelivery) {
  const items = Array.isArray(delivery.subscription.itemsSnapshot) ? delivery.subscription.itemsSnapshot : [];
  let total = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, Prisma.JsonValue>;
    const quantity = Number(item.quantityPerDelivery ?? item.quantity ?? 0);
    const unitWeight = Number(item.weightGrams ?? 0);
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitWeight) || unitWeight <= 0) {
      throw new BadRequestException('Subscription item weight snapshot is missing or invalid');
    }
    total += quantity * unitWeight;
  }
  if (total <= 0) throw new BadRequestException('Subscription delivery weight snapshot is missing');
  return Math.round(total);
}

@Injectable()
export class RegionalRoutePlanningService {
  private readonly logger = new Logger(RegionalRoutePlanningService.name);

  constructor(
    private readonly zones: RegionalDeliveryZoneService,
    private readonly workflow: DeliveryWorkflowService,
    private readonly calendar: SubscriptionCalendarService,
  ) {}

  async planGeneratedDeliveries(limit = 1000, options?: { serviceDate?: Date; assignRiders?: boolean }) {
    const where: Prisma.SubscriptionDeliveryWhereInput = {
      status: SubscriptionDeliveryStatus.ORDER_GENERATED,
      deliveryJobId: { not: null },
      runStop: null,
      ...(options?.serviceDate ? {
        serviceDate: {
          gte: new Date(Date.UTC(
            options.serviceDate.getUTCFullYear(),
            options.serviceDate.getUTCMonth(),
            options.serviceDate.getUTCDate(),
          )),
          lt: new Date(Date.UTC(
            options.serviceDate.getUTCFullYear(),
            options.serviceDate.getUTCMonth(),
            options.serviceDate.getUTCDate() + 1,
          )),
        },
      } : {}),
    };

    const deliveries = await prisma.subscriptionDelivery.findMany({
      where,
      include: {
        subscription: { include: { address: true } },
        order: { include: { items: true, payment: true } },
        store: true,
      },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(5000, limit)),
    });

    const resolved: ResolvedDelivery[] = [];
    const deferred: Array<{ deliveryId: string; orderId?: string; reason: string }> = [];

    for (const delivery of deliveries) {
      if (!delivery.storeId || !delivery.store || !delivery.order || !delivery.deliveryJobId) {
        deferred.push({
          deliveryId: delivery.id,
          orderId: delivery.order?.id,
          reason: 'Delivery is missing its generated order, job, or pickup store',
        });
        continue;
      }

      const point = pointFor(delivery);
      if (!point) {
        deferred.push({
          deliveryId: delivery.id,
          orderId: delivery.order.id,
          reason: 'Authoritative delivery coordinates are missing',
        });
        continue;
      }

      const existingZone = delivery.deliveryZoneId
        ? await prisma.deliveryZone.findFirst({ where: { id: delivery.deliveryZoneId, isActive: true } })
        : null;
      const resolution = existingZone
        ? {
            zone: existingZone,
            source: DeliveryZoneResolutionSource.MANUAL,
            confidence: 1,
            reason: undefined as string | undefined,
          }
        : await this.zones.resolve(point, delivery.storeId);

      if (!resolution.zone) {
        deferred.push({
          deliveryId: delivery.id,
          orderId: delivery.order.id,
          reason: resolution.reason || 'Delivery zone could not be resolved',
        });
        continue;
      }

      await this.zones.persistResolution({
        point,
        zone: resolution.zone as any,
        source: resolution.source,
        confidence: resolution.confidence,
        customerAddressId: delivery.subscription.addressId,
        subscriptionId: delivery.subscriptionId,
        subscriptionDeliveryId: delivery.id,
        orderId: delivery.order.id,
      });
      await this.writeEvent({
        eventType: DeliveryRouteEventType.DELIVERY_REGION_RESOLVED,
        payload: {
          subscriptionDeliveryId: delivery.id,
          orderId: delivery.order.id,
          zoneId: resolution.zone.id,
          zoneCode: resolution.zone.code,
          source: resolution.source,
          confidence: resolution.confidence,
        },
        dedupeKey: `region-resolved:${delivery.id}:${resolution.zone.id}`,
      });

      const window = this.calendar.window(
        delivery.serviceDate,
        delivery.subscription.deliveryWindowStartMinute,
        delivery.subscription.deliveryWindowEndMinute,
        resolution.zone.timezone,
      );
      resolved.push({
        delivery,
        zone: resolution.zone,
        point,
        window,
        ...hardConstraintFields(delivery),
        weightGrams: weightForDelivery(delivery),
      });
    }

    const allowMixedCashRuns = String(process.env.ALLOW_MIXED_CASH_RUNS || 'false').toLowerCase() === 'true';
    const groups = new Map<string, ResolvedDelivery[]>();
    for (const row of resolved) {
      const hardKey = [
        row.delivery.serviceDate.toISOString().slice(0, 10),
        row.delivery.storeId,
        row.window.start.toISOString(),
        row.window.end.toISOString(),
        row.zone.id,
        row.handlingRequirement,
        row.vehicleRequirement,
        allowMixedCashRuns ? 'MIXED_PAYMENT_ALLOWED' : row.paymentRequirement,
      ].join('|');
      groups.set(hardKey, [...(groups.get(hardKey) ?? []), row]);
    }

    const createdRuns: Array<{ id: string; routeCode: string }> = [];
    for (const [hardKey, group] of groups) {
      const zone = group[0].zone;
      const dayStart = new Date(Date.UTC(
        group[0].delivery.serviceDate.getUTCFullYear(),
        group[0].delivery.serviceDate.getUTCMonth(),
        group[0].delivery.serviceDate.getUTCDate(),
      ));
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const zoneAlreadyPlanned = await prisma.deliveryRunStop.count({
        where: {
          deliveryZoneId: zone.id,
          deliveryRun: {
            serviceDate: { gte: dayStart, lt: dayEnd },
            status: { not: DeliveryRunStatus.CANCELLED },
          },
        },
      });
      const remainingDailyCapacity = Math.max(0, zone.maximumDailySubscriptionCapacity - zoneAlreadyPlanned);
      const eligibleRows = group.slice(0, remainingDailyCapacity);
      for (const extra of group.slice(remainingDailyCapacity)) {
        deferred.push({
          deliveryId: extra.delivery.id,
          orderId: extra.delivery.order?.id,
          reason: `Zone ${zone.code} daily subscription capacity is exhausted`,
        });
      }
      if (!eligibleRows.length) continue;

      const origin = {
        latitude: eligibleRows[0].delivery.store!.latitude,
        longitude: eligibleRows[0].delivery.store!.longitude,
      };
      const constraints = policy(zone, eligibleRows[0].window);
      const candidates: RouteCandidate<ResolvedDelivery>[] = eligibleRows.map((row) => ({
        id: row.delivery.id,
        latitude: row.point.latitude,
        longitude: row.point.longitude,
        parcelCount: 1,
        cashDuePaise: row.delivery.cashDuePaise,
        weightGrams: row.weightGrams,
        value: row,
      }));
      const clusters = splitByOperationalConstraints(origin, candidates, constraints);

      for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
        const cluster = clusters[clusterIndex];
        const fingerprint = [hardKey, ...cluster.map((item) => item.id).sort()].join('|');
        const clusterIdentifier = `${zone.code}-${routeHash(fingerprint, 12)}`;
        const created = await this.createClusterRun({
          hardKey,
          clusterIndex,
          clusterIdentifier,
          cluster,
          origin,
          constraints,
          zone,
        });
        createdRuns.push({ id: created.id, routeCode: created.routeCode });
        if (options?.assignRiders !== false) await this.assignBestEligibleRider(created.id);
      }
    }

    if (deferred.length) this.logger.warn(`Regional planner deferred ${deferred.length} subscription deliveries`);
    return { runs: createdRuns, deferred };
  }

  private async createClusterRun(input: {
    hardKey: string;
    clusterIndex: number;
    clusterIdentifier: string;
    cluster: RouteCandidate<ResolvedDelivery>[];
    origin: GeoPoint;
    constraints: RouteConstraints;
    zone: DeliveryZone;
  }) {
    const estimate = estimateRoute(input.origin, input.cluster, input.constraints);
    const first = input.cluster[0].value;
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`regional-route:${input.clusterIdentifier}`}))`);
      const existing = await tx.deliveryRun.findFirst({
        where: {
          storeId: first.delivery.storeId!,
          serviceDate: first.delivery.serviceDate,
          slotStart: first.window.start,
          deliveryCluster: input.clusterIdentifier,
        },
      });
      if (existing) return existing;

      const expectedCashPaise = input.cluster.reduce((sum, item) => sum + item.cashDuePaise, 0);
      const expectedParcelCount = input.cluster.reduce((sum, item) => sum + item.parcelCount, 0);
      const expectedWeightGrams = input.cluster.reduce((sum, item) => sum + Number(item.weightGrams || 0), 0);
      const expectedItemCount = input.cluster.reduce(
        (sum, item) => sum + item.value.delivery.order!.items.reduce((itemSum, orderItem) => itemSum + orderItem.quantity, 0),
        0,
      );
      const code = routeCode(first.delivery.serviceDate, input.zone.code, input.clusterIndex, input.clusterIdentifier);
      const run = await tx.deliveryRun.create({
        data: {
          routeCode: code,
          storeId: first.delivery.storeId!,
          deliveryZoneId: input.zone.id,
          serviceDate: first.delivery.serviceDate,
          slotStart: first.window.start,
          slotEnd: first.window.end,
          deliveryCluster: input.clusterIdentifier,
          clusterIdentifier: input.clusterIdentifier,
          status: DeliveryRunStatus.PLANNED,
          planningAlgorithmVersion: 'regional-nearest-neighbour-v1',
          plannedAt: new Date(),
          originalStopCount: input.cluster.length,
          estimatedDistanceKm: estimate.distanceKm,
          estimatedDurationMinutes: estimate.durationMinutes,
          totalStopCount: input.cluster.length,
          expectedCashPaise,
          expectedParcelCount,
          expectedBagCount: expectedParcelCount,
          expectedItemCount,
          expectedWeightGrams,
          assignmentConstraints: {
            maximumStops: input.constraints.maximumStops,
            maximumParcels: input.constraints.maximumParcels,
            maximumCashPaise: input.constraints.maximumCashPaise,
            maximumWeightGrams: input.constraints.maximumWeightGrams ?? null,
            maximumDistanceKm: input.constraints.maximumDistanceKm,
            maximumDurationMinutes: input.constraints.maximumDurationMinutes,
            slotEndBufferMinutes: input.zone.slotEndBufferMinutes,
            allowMixedCashRuns: String(process.env.ALLOW_MIXED_CASH_RUNS || 'false').toLowerCase() === 'true',
            hardKey: input.hardKey,
          },
        },
      });

      for (let index = 0; index < input.cluster.length; index += 1) {
        const candidate = input.cluster[index];
        const row = candidate.value;
        await tx.deliveryRunStop.create({
          data: {
            deliveryRunId: run.id,
            deliveryJobId: row.delivery.deliveryJobId!,
            subscriptionDeliveryId: row.delivery.id,
            deliveryZoneId: input.zone.id,
            sequenceNumber: index + 1,
            status: DeliveryRunStopStatus.PLANNED,
            proofMode: row.delivery.proofMode,
            cashDuePaise: row.delivery.cashDuePaise,
            expectedItemCount: row.delivery.order!.items.reduce((sum, item) => sum + item.quantity, 0),
            expectedWeightGrams: Number(candidate.weightGrams || 0),
            expectedParcelCount: candidate.parcelCount,
            deliveryLatitude: candidate.latitude,
            deliveryLongitude: candidate.longitude,
          },
        });
      }

      await tx.deliveryRunAuditEntry.create({
        data: {
          deliveryRunId: run.id,
          action: 'ROUTE_CLUSTER_CREATED',
          reason: 'Deterministic regional route planning',
          metadata: {
            zoneId: input.zone.id,
            zoneCode: input.zone.code,
            stopIds: input.cluster.map((item) => item.id),
            estimatedDistanceKm: estimate.distanceKm,
            estimatedDurationMinutes: estimate.durationMinutes,
            expectedWeightGrams,
            allowMixedCashRuns: String(process.env.ALLOW_MIXED_CASH_RUNS || 'false').toLowerCase() === 'true',
            algorithmVersion: 'regional-nearest-neighbour-v1',
          },
          idempotencyKey: `route-created:${input.clusterIdentifier}`,
        },
      });
      await tx.deliveryRouteEvent.create({
        data: {
          eventType: DeliveryRouteEventType.ROUTE_CLUSTER_CREATED,
          deliveryRunId: run.id,
          payload: {
            routeCode: run.routeCode,
            zoneId: input.zone.id,
            zoneCode: input.zone.code,
            stopCount: input.cluster.length,
          },
          dedupeKey: `route-cluster-created:${input.clusterIdentifier}`,
        },
      });
      return run;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

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

  private async writeEvent(input: {
    eventType: DeliveryRouteEventType;
    deliveryRunId?: string;
    deliveryRunStopId?: string;
    actorUserId?: string;
    payload: Prisma.InputJsonValue;
    dedupeKey: string;
  }) {
    try {
      await prisma.deliveryRouteEvent.create({ data: input });
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }
}
