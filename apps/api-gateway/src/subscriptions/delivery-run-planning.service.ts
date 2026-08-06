import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryRunStatus,
  DeliveryRunStopStatus,
  OrderStatus,
  Prisma,
  Role,
  SubscriptionDeliveryStatus,
  prisma,
} from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { createHash } from 'crypto';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryOperationsService } from '../orders/delivery-operations.service';
import { AssignDeliveryRunDto, ConfirmRunPackingDto, ConfirmRunStopReturnDto, RunVersionDto } from './subscriptions.dto';
import { serviceWindow, startOfUtcDay } from './subscription-calendar.service';
import { isOneOf } from '../common/enum-membership';

type Actor = { id: string; role: Role };

type DemandProductTotal = { productId: string; name: string; quantity: number };
type DemandRow = {
  storeId: string;
  serviceDate: string;
  stopCount: number;
  productTotals: Map<string, DemandProductTotal>;
};

function snapshotItems(value: Prisma.JsonValue): Array<{ productId: string; name: string; quantity: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, Prisma.JsonValue>;
    return [{
      productId: String(item.productId ?? ''),
      name: String(item.productName ?? item.name ?? 'Subscription item'),
      quantity: Number(item.quantityPerDelivery ?? item.quantity ?? 0),
    }];
  }).filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);
}

function clusterFromAddress(addressSnapshot: unknown) {
  const address = (addressSnapshot ?? {}) as Record<string, unknown>;
  return String(address.pincode || address.city || 'UNCLUSTERED').trim().toUpperCase();
}

function routeCode(key: string) {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 8).toUpperCase();
  return `AAGAM-RUN-${key.slice(0, 10).replace(/-/g, '')}-${digest}`;
}

@Injectable()
export class DeliveryRunPlanningService {
  constructor(
    private readonly workflow: DeliveryWorkflowService,
    private readonly deliveryOperations: DeliveryOperationsService,
  ) {}

  async planGeneratedDeliveries(limit = 500) {
    const deliveries = await prisma.subscriptionDelivery.findMany({
      where: {
        status: SubscriptionDeliveryStatus.ORDER_GENERATED,
        deliveryJobId: { not: null },
        runStop: null,
      },
      include: {
        subscription: true,
        order: { include: { items: true } },
      },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(2000, limit)),
    });
    const groups = new Map<string, typeof deliveries>();
    for (const delivery of deliveries) {
      if (!delivery.storeId || !delivery.order || !delivery.deliveryJobId) continue;
      const window = serviceWindow(
        delivery.serviceDate,
        delivery.subscription.deliveryWindowStartMinute,
        delivery.subscription.deliveryWindowEndMinute,
      );
      const cluster = clusterFromAddress(delivery.subscription.addressSnapshot);
      const key = [
        delivery.serviceDate.toISOString().slice(0, 10),
        delivery.storeId,
        window.start.toISOString(),
        cluster,
      ].join('|');
      groups.set(key, [...(groups.get(key) ?? []), delivery]);
    }
    const runs: unknown[] = [];
    for (const [key, group] of groups) {
      runs.push(await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run:${key}`}))`);
        const first = group[0];
        const window = serviceWindow(
          first.serviceDate,
          first.subscription.deliveryWindowStartMinute,
          first.subscription.deliveryWindowEndMinute,
        );
        const cluster = clusterFromAddress(first.subscription.addressSnapshot);
        let run = await tx.deliveryRun.findFirst({
          where: {
            storeId: first.storeId!,
            serviceDate: first.serviceDate,
            slotStart: window.start,
            deliveryCluster: cluster,
          },
        });
        if (!run) {
          run = await tx.deliveryRun.create({
            data: {
              routeCode: routeCode(key),
              storeId: first.storeId!,
              serviceDate: first.serviceDate,
              slotStart: window.start,
              slotEnd: window.end,
              deliveryCluster: cluster,
            },
          });
        }
        let sequence = await tx.deliveryRunStop.count({ where: { deliveryRunId: run.id } });
        for (const delivery of group) {
          sequence += 1;
          const expectedItems = delivery.order!.items.reduce((sum, item) => sum + item.quantity, 0);
          try {
            await tx.deliveryRunStop.create({
              data: {
                deliveryRunId: run.id,
                deliveryJobId: delivery.deliveryJobId!,
                subscriptionDeliveryId: delivery.id,
                sequenceNumber: sequence,
                proofMode: delivery.proofMode,
                cashDuePaise: delivery.cashDuePaise,
                expectedItemCount: expectedItems,
                expectedParcelCount: 1,
              },
            });
          } catch (error: unknown) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
          }
        }
        const totals = await tx.deliveryRunStop.aggregate({
          where: { deliveryRunId: run.id },
          _count: { _all: true },
          _sum: { cashDuePaise: true, expectedItemCount: true, expectedParcelCount: true },
        });
        return tx.deliveryRun.update({
          where: { id: run.id },
          data: {
            totalStopCount: totals._count._all,
            expectedCashPaise: totals._sum.cashDuePaise ?? 0,
            expectedItemCount: totals._sum.expectedItemCount ?? 0,
            expectedParcelCount: totals._sum.expectedParcelCount ?? 0,
            expectedBagCount: totals._sum.expectedParcelCount ?? 0,
          },
          include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    }
    return runs;
  }

  async assign(runId: string, dto: AssignDeliveryRunDto, actor: Actor) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-assign:${runId}`}))`);
      const run = await tx.deliveryRun.findUnique({
        where: { id: runId },
        include: { stops: { include: { deliveryJob: true } } },
      });
      if (!run) throw new NotFoundException('Delivery run not found');
      if (run.version !== dto.version) throw new ConflictException('Delivery run changed; refresh and try again');
      if (!isOneOf(run.status, [DeliveryRunStatus.PLANNED, DeliveryRunStatus.READY_FOR_PICKUP])) {
        throw new BadRequestException(`Run cannot be assigned from ${run.status}`);
      }
      const rider = await tx.riderProfile.findFirst({
        where: { id: dto.riderId, approvalStatus: 'APPROVED' },
        include: { user: { select: { id: true, isActive: true } } },
      });
      if (!rider?.user.isActive) throw new BadRequestException('Rider is not active and approved');
      for (const stop of run.stops) {
        if (stop.deliveryJob.status === DeliveryJobStatus.WAITING_FOR_DISPATCH) {
          await this.workflow.transitionWithinTransaction(
            tx,
            stop.deliveryJobId,
            DeliveryJobStatus.RIDER_ASSIGNED,
            actor,
            {
              expectedStatus: DeliveryJobStatus.WAITING_FOR_DISPATCH,
              assignedRiderId: rider.id,
              skipRoleCheck: true,
              metadata: { deliveryRunId: run.id, routeCode: run.routeCode },
            },
          );
        } else if (stop.deliveryJob.currentRiderId !== rider.id) {
          throw new ConflictException('One or more run stops already belong to another rider');
        }
        await tx.subscriptionDelivery.update({
          where: { id: stop.subscriptionDeliveryId },
          data: { status: SubscriptionDeliveryStatus.ASSIGNED },
        });
      }
      await tx.riderProfile.update({ where: { id: rider.id }, data: { status: 'BUSY' } });
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: { riderId: rider.id, version: { increment: 1 } },
        include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async confirmPacking(runId: string, dto: ConfirmRunPackingDto, actor: Actor) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-pack:${runId}`}))`);
      const run = await tx.deliveryRun.findUnique({
        where: { id: runId },
        include: {
          store: { select: { ownerId: true } },
          stops: { include: { deliveryJob: { select: { orderId: true } } } },
        },
      });
      if (!run) throw new NotFoundException('Delivery run not found');
      if (actor.role !== Role.ADMIN && (actor.role !== Role.STORE_OWNER || run.store.ownerId !== actor.id)) {
        throw new ForbiddenException('Only the owning store can confirm run packing');
      }
      if (run.status === DeliveryRunStatus.READY_FOR_PICKUP && run.packedBagCount === run.expectedBagCount) return run;
      if (run.version !== dto.version) throw new ConflictException('Delivery run changed; refresh and try again');
      if (dto.expectedBagCount !== run.expectedBagCount || dto.packedBagCount !== dto.expectedBagCount) {
        throw new BadRequestException('Packed bag count must exactly match the server-calculated route bag count');
      }
      for (const stop of run.stops) {
        const order = await tx.order.findUnique({ where: { id: stop.deliveryJob.orderId }, select: { status: true } });
        if (!order) throw new ConflictException('Run order is missing');
        if (!isOneOf(order.status, [OrderStatus.CONFIRMED, OrderStatus.PICKING, OrderStatus.PACKED, OrderStatus.RIDER_ASSIGNED])) {
          throw new ConflictException(`Run order cannot be packed from ${order.status}`);
        }
        if (order.status !== OrderStatus.PACKED && order.status !== OrderStatus.RIDER_ASSIGNED) {
          await tx.order.update({ where: { id: stop.deliveryJob.orderId }, data: { status: OrderStatus.PACKED, packedAt: new Date() } });
          await tx.orderStatusHistory.create({ data: {
            orderId: stop.deliveryJob.orderId,
            fromStatus: order.status,
            toStatus: OrderStatus.PACKED,
            actorUserId: actor.id,
            actorRole: actor.role,
            note: 'Packed as part of a subscription delivery run',
            metadata: { deliveryRunId: run.id, routeCode: run.routeCode },
          }});
        }
        await tx.subscriptionDelivery.update({ where: { id: stop.subscriptionDeliveryId }, data: { status: SubscriptionDeliveryStatus.PACKED } });
        await tx.deliveryRunStop.update({ where: { id: stop.id }, data: { status: DeliveryRunStopStatus.READY } });
      }
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.READY_FOR_PICKUP,
          expectedBagCount: dto.expectedBagCount,
          packedBagCount: dto.packedBagCount,
          crateCode: dto.crateCode?.trim() || run.crateCode,
          packingConfirmedAt: new Date(),
          packingConfirmedById: actor.id,
          version: { increment: 1 },
        },
        include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async confirmStoreHandoff(runId: string, dto: RunVersionDto, actor: Actor) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-store-handoff:${runId}`}))`);
      const run = await tx.deliveryRun.findUnique({
        where: { id: runId },
        include: { store: { select: { ownerId: true } }, stops: { include: { deliveryJob: true } } },
      });
      if (!run) throw new NotFoundException('Delivery run not found');
      if (actor.role !== Role.ADMIN && (actor.role !== Role.STORE_OWNER || run.store.ownerId !== actor.id)) {
        throw new ForbiddenException('Only the owning store can confirm route handoff');
      }
      if (run.storeHandoffConfirmedAt) return run;
      if (run.version !== dto.version) throw new ConflictException('Delivery run changed; refresh and try again');
      if (run.status !== DeliveryRunStatus.READY_FOR_PICKUP || !run.riderId) {
        throw new BadRequestException('Run must be packed and assigned before store handoff');
      }
      if (run.expectedBagCount < 1 || run.packedBagCount !== run.expectedBagCount) {
        throw new ConflictException('Route bag verification is incomplete');
      }
      for (const stop of run.stops) {
        let status = stop.deliveryJob.status;
        const transitions = [DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE, DeliveryJobStatus.RIDER_AT_STORE];
        for (const target of transitions) {
          const allowed =
            (status === DeliveryJobStatus.RIDER_ASSIGNED && target === DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE) ||
            (status === DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE && target === DeliveryJobStatus.RIDER_AT_STORE);
          if (allowed) {
            await this.workflow.transitionWithinTransaction(tx, stop.deliveryJobId, target, actor, {
              expectedStatus: status,
              skipRoleCheck: true,
              metadata: { deliveryRunId: run.id, routeCode: run.routeCode, routeLevelStoreHandoff: true },
            });
            status = target;
          }
        }
        if (status !== DeliveryJobStatus.RIDER_AT_STORE) {
          throw new ConflictException(`Stop ${stop.sequenceNumber} is not ready for store handoff`);
        }
      }
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          storeHandoffConfirmedAt: new Date(),
          storeHandoffConfirmedById: actor.id,
          version: { increment: 1 },
        },
        include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async storeDemand(actor: Actor, days = 14) {
    const stores = actor.role === Role.ADMIN
      ? await prisma.store.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } })
      : await prisma.store.findMany({ where: { ownerId: actor.id, isActive: true, deletedAt: null }, select: { id: true, name: true } });
    const storeIds = stores.map((store) => store.id);
    const from = startOfUtcDay(new Date());
    const to = new Date(from.getTime() + Math.max(1, Math.min(90, days)) * 86_400_000);
    const deliveries = await prisma.subscriptionDelivery.findMany({
      where: {
        serviceDate: { gte: from, lt: to },
        status: { in: [
          SubscriptionDeliveryStatus.SCHEDULED,
          SubscriptionDeliveryStatus.ORDER_GENERATED,
          SubscriptionDeliveryStatus.PREPARING,
          SubscriptionDeliveryStatus.PACKED,
          SubscriptionDeliveryStatus.ASSIGNED,
        ] },
        OR: [{ storeId: { in: storeIds } }, { subscription: { homeStoreId: { in: storeIds } } }],
      },
      include: { subscription: { select: { homeStoreId: true, itemsSnapshot: true } }, order: { include: { items: { include: { product: true } } } } },
      orderBy: { serviceDate: 'asc' },
    });
    const rows = new Map<string, DemandRow>();
    for (const delivery of deliveries) {
      const storeId = delivery.storeId || delivery.subscription.homeStoreId;
      if (!storeId) continue;
      const day = delivery.serviceDate.toISOString().slice(0, 10);
      const key = `${storeId}:${day}`;
      const row = rows.get(key) || { storeId, serviceDate: day, stopCount: 0, productTotals: new Map<string, DemandProductTotal>() };
      row.stopCount += 1;
      const items = delivery.order?.items?.length
        ? delivery.order.items.map((item) => ({ productId: item.productId, name: item.product.name, quantity: item.quantity }))
        : snapshotItems(delivery.subscription.itemsSnapshot);
      for (const item of items) {
        const current = row.productTotals.get(item.productId) || { productId: item.productId, name: item.name, quantity: 0 };
        current.quantity += Number(item.quantity || 0);
        row.productTotals.set(item.productId, current);
      }
      rows.set(key, row);
    }
    return [...rows.values()].map((row) => ({ ...row, productTotals: [...row.productTotals.values()] }));
  }

  async storeRuns(actor: Actor, serviceDate?: string) {
    const day = serviceDate ? startOfUtcDay(serviceDate) : startOfUtcDay(new Date());
    const next = new Date(day.getTime() + 86_400_000);
    return prisma.deliveryRun.findMany({
      where: {
        serviceDate: { gte: day, lt: next },
        ...(actor.role === Role.ADMIN ? {} : { store: { ownerId: actor.id } }),
      },
      orderBy: [{ slotStart: 'asc' }, { routeCode: 'asc' }],
      include: {
        deliveryZone: true,
        rider: { include: { user: { select: { id: true, name: true, phone: true } } } },
        stops: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            subscriptionDelivery: {
              include: {
                subscription: { select: { customerId: true, addressSnapshot: true, itemsSnapshot: true, deliveryMethod: true } },
                order: { include: { customer: { select: { name: true, phone: true } }, items: { include: { product: true } } } },
              },
            },
          },
        },
      },
    });
  }

  async confirmReturnedStop(
    runId: string,
    stopId: string,
    dto: ConfirmRunStopReturnDto,
    actor: Actor,
    idempotencyKey?: string,
  ) {
    const stop = await prisma.deliveryRunStop.findFirst({
      where: {
        id: stopId,
        deliveryRunId: runId,
        ...(actor.role === Role.ADMIN ? {} : { deliveryRun: { store: { ownerId: actor.id } } }),
      },
      include: { deliveryRun: { include: { store: { select: { ownerId: true } } } }, deliveryJob: true, subscriptionDelivery: { select: { subscriptionId: true } } },
    });
    if (!stop) throw new NotFoundException('Run stop not found for this store');
    if (stop.version !== dto.version) throw new ConflictException('Run stop changed; refresh and try again');
    if (stop.status === DeliveryRunStopStatus.RETURNED) return stop;
    if (stop.status !== DeliveryRunStopStatus.RETURN_REQUIRED) {
      throw new BadRequestException('Only a return-required stop can be received at the store');
    }
    await this.deliveryOperations.confirmReturn(
      stop.deliveryJobId,
      actor,
      idempotencyKey || `subscription-return-confirm:${stop.id}`,
    );
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`delivery-run-return:${stopId}`}))`);
      const current = await tx.deliveryRunStop.findUnique({ where: { id: stopId } });
      if (!current) throw new NotFoundException('Run stop not found');
      if (current.status === DeliveryRunStopStatus.RETURNED) return current;
      if (current.status !== DeliveryRunStopStatus.RETURN_REQUIRED) {
        throw new ConflictException('Run stop return state changed');
      }
      const auditKey = `audit:return-received:${stopId}`;
      const existingAudit = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: auditKey } });
      if (!existingAudit) {
        await tx.subscriptionAuditEntry.create({
          data: {
            subscriptionId: stop.subscriptionDelivery.subscriptionId,
            actorUserId: actor.id,
            actorRole: actor.role,
            action: 'RETURN_RECEIVED_AT_STORE',
            reason: dto.note?.trim() || null,
            metadata: { deliveryRunId: runId, deliveryRunStopId: stopId, deliveryJobId: stop.deliveryJobId },
            idempotencyKey: auditKey,
          },
        });
      }
      return tx.deliveryRunStop.update({
        where: { id: stopId },
        data: { status: DeliveryRunStopStatus.RETURNED, version: { increment: 1 } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async exceptions(actor: Actor) {
    return prisma.deliveryRunStop.findMany({
      where: {
        status: { in: [DeliveryRunStopStatus.FAILED, DeliveryRunStopStatus.RETRY_PENDING, DeliveryRunStopStatus.RETURN_REQUIRED] },
        ...(actor.role === Role.ADMIN ? {} : { deliveryRun: { store: { ownerId: actor.id } } }),
      },
      orderBy: { updatedAt: 'desc' },
      include: { deliveryRun: true, subscriptionDelivery: { include: { subscription: true, order: true } } },
      take: 200,
    });
  }
}
