/**
 * Order status transition engine.
 *
 * Split out of the former order.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { reconcileRiderOperationalStatus } from '../riders/rider-operational-status';
import { OrderServiceBase } from './order.service.base';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  PAYMENT_PENDING: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
  CONFIRMED: ['PICKING', 'PACKED', 'STORE_DELIVERING', 'RIDER_ASSIGNED', 'CANCELLED'],
  PICKING: ['PACKED', 'STORE_DELIVERING', 'RIDER_ASSIGNED', 'CANCELLED'],
  PACKED: ['STORE_DELIVERING', 'RIDER_ASSIGNED', 'CANCELLED'],
  STORE_DELIVERING: ['STORE_DELIVERED', 'CANCELLED'],
  STORE_DELIVERED: [],
  RIDER_ASSIGNED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const RIDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  RIDER_ASSIGNED: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
};

const STORE_OWNER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  PAYMENT_PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PICKING, OrderStatus.PACKED, OrderStatus.CANCELLED],
  PICKING: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  PACKED: [OrderStatus.STORE_DELIVERING, OrderStatus.CANCELLED],
  STORE_DELIVERING: [OrderStatus.STORE_DELIVERED, OrderStatus.CANCELLED],
};

const STORE_OWNER_FORBIDDEN: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.OUT_FOR_DELIVERY,
];

export class OrderStatusService extends OrderServiceBase {
  async updateStatus(
    id: string,
    nextStatus: OrderStatus,
    actor: { id: string; role: Role },
    riderId?: string,
  ) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        store: {
          select: { ownerId: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === nextStatus) {
      return order;
    }

    const currentStatus = order.status as OrderStatus;

    // Terminal state check
    const terminalStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
    if (terminalStatuses.includes(currentStatus)) {
      throw new BadRequestException(`Order is already ${currentStatus} and cannot be changed`);
    }

    // Generic transition validation
    const allowedNextStatuses = ORDER_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(`Cannot transition order from ${order.status} to ${nextStatus}`);
    }

    // Role-specific validation
    if (actor.role === Role.RIDER) {
      const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
      if (!riderProfile || order.riderId !== riderProfile.id) {
        throw new ForbiddenException('You can only update your assigned orders');
      }
      const riderAllowedNext = RIDER_TRANSITIONS[currentStatus] || [];
      if (!riderAllowedNext.includes(nextStatus)) {
        throw new ForbiddenException(`Rider transition not allowed: ${currentStatus} -> ${nextStatus}`);
      }
    }

    if (actor.role === Role.STORE_OWNER) {
      if (order.store?.ownerId !== actor.id) {
        throw new ForbiddenException('Not allowed to update orders for this store');
      }
      if (STORE_OWNER_FORBIDDEN.includes(nextStatus)) {
        throw new ForbiddenException(`Store owner cannot set status to ${nextStatus}`);
      }
      const ownerAllowedNext = STORE_OWNER_TRANSITIONS[currentStatus] || [];
      if (!ownerAllowedNext.includes(nextStatus)) {
        throw new ForbiddenException(`Store transition not allowed: ${currentStatus} -> ${nextStatus}`);
      }
      if (
        order.deliveryWindowStart &&
        ([OrderStatus.PICKING, OrderStatus.PACKED] as OrderStatus[]).includes(nextStatus) &&
        Date.now() < order.deliveryWindowStart.getTime() - 2 * 60 * 60_000
      ) {
        throw new BadRequestException('Scheduled orders can be prepared from two hours before the delivery window');
      }
    }

    // Admin can do all transitions (no additional restrictions)

    const data: any = { status: nextStatus };
    const timestampField = this.timestampFieldForStatus(nextStatus);
    if (timestampField) {
      data[timestampField] = new Date();
    }
    if (riderId) {
      data.riderId = riderId;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data,
      });

      // Build metadata for delivery proof
      const historyMetadata: any = {};
      if (nextStatus === OrderStatus.DELIVERED) {
        historyMetadata.deliveredAt = new Date().toISOString();
        historyMetadata.actorRole = actor.role;
        if (actor.role === Role.RIDER) {
          const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
          if (riderProfile) {
            historyMetadata.riderProfileId = riderProfile.id;
          }
        }
        historyMetadata.deliveryProof = {
          method: 'rider_confirmed',
          timestamp: new Date().toISOString(),
        };
      }

      await this.recordStatusHistory({
        orderId: id,
        fromStatus: order.status as OrderStatus,
        toStatus: nextStatus,
        actor,
        note: this.statusNote(nextStatus, actor.role),
        metadata: Object.keys(historyMetadata).length > 0 ? historyMetadata : undefined,
      }, tx);

      if (nextStatus === OrderStatus.CANCELLED) {
        await this.releaseCouponRedemption(id, 'ORDER_CANCELLED', tx);
        await this.cancelAssociatedDeliveryJob(id, tx);
      }

      if (nextStatus === OrderStatus.DELIVERED) {
        await this.completeAssociatedDeliveryJob(id, tx);
        const orderItems = await tx.orderItem.findMany({ where: { orderId: id } });
        for (const item of orderItems) {
          const existing = await tx.inventory.findUnique({
            where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
          });
          const previousQuantity = existing?.quantity ?? 0;

          await tx.inventoryLedger.create({
            data: {
              storeId: order.storeId,
              productId: item.productId,
              orderId: id,
              reason: 'ORDER_DELIVERED_FINALIZE',
              quantityDelta: 0,
              previousQuantity,
              newQuantity: previousQuantity,
              actorUserId: actor.id,
              note: `Order ${id} delivered: ${item.quantity} units finalized`,
            },
          });
        }
      }

      return updatedOrder;
    });

    if (updated.riderId && nextStatus === OrderStatus.DELIVERED) {
      await reconcileRiderOperationalStatus(prisma, updated.riderId).catch(() => null);
    }

    if (updated.riderId && nextStatus === OrderStatus.CANCELLED) {
      await reconcileRiderOperationalStatus(prisma, updated.riderId).catch(() => null);
    }

    await this.emitTrackingUpdate(id);
    return updated;
  }
}
