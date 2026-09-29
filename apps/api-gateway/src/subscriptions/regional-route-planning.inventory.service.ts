/**
 * Delivery-to-run inventory planning.
 *
 * Split out of the former regional-route-planning.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable, Logger } from '@nestjs/common';
import { DeliveryRouteEventType, DeliveryRunStatus, DeliveryRunStopStatus, DeliveryZone, DeliveryZoneResolutionSource, Prisma, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { GeoPoint, RouteCandidate, RouteConstraints, estimateRoute, splitByOperationalConstraints } from './regional-routing.geometry';
import { ResolvedDelivery, routeHash, routeCode, policy, pointFor, hardConstraintFields, weightForDelivery } from './regional-route-planning.shared';
import { RegionalDeliveryZoneService } from './regional-delivery-zone.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { RegionalRouteAssignmentService } from './regional-route-assignment.service';

@Injectable()
export class RegionalRoutePlanningInventoryService {
  private readonly logger = new Logger('RegionalRoutePlanningService');

  constructor(
    private readonly zones: RegionalDeliveryZoneService,
    private readonly calendar: SubscriptionCalendarService,
    private readonly assignment: RegionalRouteAssignmentService,
  ) {}

  async planGeneratedDeliveries(limit = 1000, options?: { serviceDate?: Date; assignRiders?: boolean }) {
    const where: Prisma.SubscriptionDeliveryWhereInput = {
      status: SubscriptionDeliveryStatus.ORDER_GENERATED,
      deliveryJobId: { not: null },
      runStop: null,
      subscription: { storeDelivery: { not: true } },
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
        if (options?.assignRiders !== false) await this.assignment.assignBestEligibleRider(created.id);
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
