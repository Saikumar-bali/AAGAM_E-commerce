/**
 * Regional routing dashboard and event polling.
 *
 * Split out of the former regional-route-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException } from '@nestjs/common';
import { DeliveryRunStatus, Prisma, Role, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { RegionalRouteOperationsServiceBase, Actor, safeRouteEventMessage } from './regional-route-operations.service.base';

export class RegionalRouteQueryService extends RegionalRouteOperationsServiceBase {
  async dashboard(date?: string) {
    const day = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const to = new Date(from.getTime() + 86_400_000);

    const [zones, runs, unassigned, riders, stores, recentEvents] = await Promise.all([
      prisma.deliveryZone.findMany({
        where: { isActive: true },
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
        include: { storeLinks: true, preferredRiderLinks: true },
      }),
      prisma.deliveryRun.findMany({
        where: { serviceDate: { gte: from, lt: to }, status: { not: DeliveryRunStatus.CANCELLED } },
        orderBy: [{ slotStart: 'asc' }, { routeCode: 'asc' }],
        include: {
          deliveryZone: true,
          store: { select: { id: true, name: true, latitude: true, longitude: true, address: true } },
          rider: {
            include: {
              user: { select: { id: true, name: true } },
              availabilityLocation: true,
            },
          },
          stops: {
            orderBy: { sequenceNumber: 'asc' },
            include: {
              deliveryJob: {
                include: { order: { include: { customer: { select: { name: true } } } } },
              },
            },
          },
        },
      }),
      prisma.subscriptionDelivery.findMany({
        where: {
          serviceDate: { gte: from, lt: to },
          status: SubscriptionDeliveryStatus.ORDER_GENERATED,
          runStop: null,
          // Store-delivery subscriptions are fulfilled by the store queue, not
          // the rider network: exclude them from the unassigned rider workload
          // (same predicate the delivery-run planners already apply).
          subscription: { storeDelivery: { not: true } },
        },
        include: {
          subscription: { include: { address: true } },
          order: true,
          store: true,
          deliveryZone: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.riderProfile.findMany({
        where: { user: { isActive: true }, approvalStatus: 'APPROVED' },
        include: {
          user: { select: { id: true, name: true } },
          availabilityLocation: true,
          homeZone: true,
        },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.store.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, address: true, latitude: true, longitude: true },
        orderBy: { name: 'asc' },
      }),
      prisma.deliveryRouteEvent.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const zoneSummaries = zones.map((zone) => {
      const zoneRuns = runs.filter((run) => run.deliveryZoneId === zone.id);
      return {
        ...zone,
        deliveryCount: zoneRuns.reduce((sum, run) => sum + run.totalStopCount, 0),
        availableRiderCount: riders.filter((rider) =>
          rider.status === 'ONLINE'
          && (rider.homeZoneId === zone.id || zone.preferredRiderLinks.some((link) => link.riderProfileId === rider.id)),
        ).length,
        estimatedDurationMinutes: zoneRuns.reduce((sum, run) => sum + run.estimatedDurationMinutes, 0),
        expectedCashPaise: zoneRuns.reduce((sum, run) => sum + run.expectedCashPaise, 0),
        status: zoneRuns.some((run) => run.status === DeliveryRunStatus.RIDER_NEEDED)
          ? 'RIDER_NEEDED'
          : zoneRuns.some((run) => run.expectedCashPaise > zone.cashRiskLimitPaise)
            ? 'CASH_LIMIT_RISK'
            : zoneRuns.length ? 'READY' : 'EMPTY',
      };
    });

    return {
      date: from.toISOString().slice(0, 10),
      zones: zoneSummaries,
      runs,
      unassigned,
      riders,
      stores,
      recentEvents,
      totals: {
        deliveries: runs.reduce((sum, run) => sum + run.totalStopCount, 0),
        runs: runs.length,
        unassigned: unassigned.length,
        ridersNeeded: runs.filter((run) => run.status === DeliveryRunStatus.RIDER_NEEDED).length,
        expectedCashPaise: runs.reduce((sum, run) => sum + run.expectedCashPaise, 0),
        collectedCashPaise: runs.reduce((sum, run) => sum + run.collectedCashPaise, 0),
        heldCashPaise: runs.reduce((sum, run) => sum + Math.max(0, run.collectedCashPaise - run.depositedCashPaise), 0),
      },
    };
  }

  async events(after?: string, actor?: Actor) {
    let afterDate: Date | undefined;
    if (after) {
      afterDate = new Date(after);
      if (Number.isNaN(afterDate.getTime())) throw new BadRequestException('Invalid regional-event after timestamp');
    }
    let deliveryRunWhere: Prisma.DeliveryRunWhereInput | undefined;
    if (actor?.role === Role.RIDER) {
      const rider = await prisma.riderProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
      if (!rider) return [];
      deliveryRunWhere = { riderId: rider.id };
    } else if (actor?.role === Role.STORE_OWNER) {
      const stores = await prisma.store.findMany({ where: { ownerId: actor.id }, select: { id: true } });
      if (!stores.length) return [];
      deliveryRunWhere = { storeId: { in: stores.map((store) => store.id) } };
    }

    const rows = await prisma.deliveryRouteEvent.findMany({
      where: {
        ...(afterDate ? { createdAt: { gt: afterDate } } : {}),
        ...(deliveryRunWhere ? { deliveryRun: { is: deliveryRunWhere } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    if (!actor || actor.role === Role.ADMIN) return rows;
    return rows.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      deliveryRunId: event.deliveryRunId,
      deliveryRunStopId: event.deliveryRunStopId,
      createdAt: event.createdAt,
      payload: { message: safeRouteEventMessage(event.eventType) },
    }));
  }
}
