/**
 * Order cancellation and refunds.
 *
 * Split out of the former order.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Role, prisma } from '@aagam/database';
import { OrderServiceBase } from './order.service.base';

export class OrderCancellationService extends OrderServiceBase {
  async cancelMyOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId: userId },
      include: { items: true, payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const cancellableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PAYMENT_PENDING, OrderStatus.CONFIRMED];
    if (!cancellableStatuses.includes(order.status as OrderStatus)) {
      throw new BadRequestException('Order can no longer be cancelled');
    }

    return prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const existing = await tx.inventory.findUnique({
          where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
        });
        const previousQuantity = existing?.quantity ?? 0;

        await tx.inventory.updateMany({
          where: { storeId: order.storeId, productId: item.productId },
          data: { quantity: { increment: item.quantity } },
        });

        await tx.inventoryLedger.create({
          data: {
            storeId: order.storeId,
            productId: item.productId,
            orderId: order.id,
            reason: 'ORDER_CANCEL_RESTORE',
            quantityDelta: item.quantity,
            previousQuantity,
            newQuantity: previousQuantity + item.quantity,
            actorUserId: userId,
            note: `Cancelled order ${order.id}: restored ${item.quantity} units`,
          },
        });
      }

      // Handle payment/refund for cancellation
      if (order.payment) {
        if (order.payment.status === PaymentStatus.CAPTURED) {
          await this.refundsService.createRefundForPayment({
            orderId: order.id,
            paymentId: order.payment.id,
            amountPaise: order.grandTotalPaise,
            reason: 'Order cancelled after payment captured',
            requestedByUserId: userId,
          }, tx);
        } else if (order.payment.status === PaymentStatus.PENDING_COD) {
          // COD cancellation: no refund needed
        }
        // FAILED payment: no refund needed
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });

      await this.cancelAssociatedDeliveryJob(order.id, tx);

      await this.recordStatusHistory(
        {
          orderId: order.id,
          fromStatus: order.status as OrderStatus,
          toStatus: OrderStatus.CANCELLED,
          actor: { id: userId, role: Role.CUSTOMER },
          note: 'Customer cancelled order',
        },
        tx,
      );

      await this.releaseCouponRedemption(order.id, 'CUSTOMER_CANCELLED', tx);

      return updated;
    });
  }

  async forceCancel(orderId: string, actor: { id: string; role: Role }, reason?: string) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can force cancel orders');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const forceCancelTermStatuses: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];
    if (forceCancelTermStatuses.includes(order.status as OrderStatus)) {
      throw new BadRequestException(`Order is already ${order.status}`);
    }

    return prisma.$transaction(async (tx) => {
      // Restore inventory if not already restored
      if (order.status !== 'PAYMENT_FAILED') {
        for (const item of order.items) {
          const existing = await tx.inventory.findUnique({
            where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
          });
          const previousQuantity = existing?.quantity ?? 0;

          await tx.inventory.updateMany({
            where: { storeId: order.storeId, productId: item.productId },
            data: { quantity: { increment: item.quantity } },
          });

          await tx.inventoryLedger.create({
            data: {
              storeId: order.storeId,
              productId: item.productId,
              orderId: order.id,
              reason: 'ORDER_CANCEL_RESTORE',
              quantityDelta: item.quantity,
              previousQuantity,
              newQuantity: previousQuantity + item.quantity,
              actorUserId: actor.id,
              note: `Admin force cancelled order ${order.id}: restored ${item.quantity} units`,
            },
          });
        }
      }

      if (order.payment) {
        if (order.payment.status === PaymentStatus.CAPTURED) {
          await this.refundsService.createRefundForPayment({
            orderId: order.id,
            paymentId: order.payment.id,
            amountPaise: order.grandTotalPaise,
            reason: reason || 'Admin force cancelled order',
            requestedByUserId: actor.id,
          }, tx);
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });

      await this.cancelAssociatedDeliveryJob(orderId, tx);

      await this.recordStatusHistory({
        orderId,
        fromStatus: order.status as OrderStatus,
        toStatus: OrderStatus.CANCELLED,
        actor,
        note: reason || 'Force cancelled by admin',
        metadata: { forceCancel: true, reason: reason || null },
      }, tx);

      await this.releaseCouponRedemption(orderId, reason || 'ADMIN_CANCELLED', tx);

      // Set rider back to online if assigned
      if (updated.riderId) {
        await tx.riderProfile.update({
          where: { id: updated.riderId },
          data: { status: 'ONLINE' },
        }).catch(() => null);
      }

      return updated;
    });
  }
}
