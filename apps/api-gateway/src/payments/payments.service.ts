import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponRedemptionStatus, PaymentMethod, PaymentStatus, RefundStatus, prisma } from '@aagam/database';

@Injectable()
export class PaymentsService {
  async captureSimulatedPayment(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, status: true, grandTotalPaise: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not allowed');

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.method !== PaymentMethod.ONLINE) throw new BadRequestException('Only online payments can be captured');

    // Idempotency: already captured
    if (payment.status === PaymentStatus.CAPTURED) {
      return { success: true, status: PaymentStatus.CAPTURED };
    }
    if (payment.status !== PaymentStatus.CREATED || order.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException('Payment is not awaiting capture');
    }

    // Validate payment amount matches order amount
    if (payment.amountPaise !== order.grandTotalPaise) {
      throw new BadRequestException(`Payment amount (${payment.amountPaise} paise) does not match order total (${order.grandTotalPaise} paise)`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId },
        data: { status: PaymentStatus.CAPTURED, verifiedAt: new Date() },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED' as any, confirmedAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status as any,
          toStatus: 'CONFIRMED' as any,
          actorUserId: userId,
          actorRole: 'CUSTOMER',
          note: 'Online payment captured',
        },
      });
      await tx.couponRedemption.updateMany({
        where: { orderId, status: CouponRedemptionStatus.RESERVED },
        data: {
          status: CouponRedemptionStatus.REDEEMED,
          redeemedAt: new Date(),
          releasedAt: null,
          releaseReason: null,
        },
      });
    });

    return { success: true, status: PaymentStatus.CAPTURED };
  }

  async failSimulatedPayment(userId: string, orderId: string, reason?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true, status: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not allowed');

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.method !== PaymentMethod.ONLINE) throw new BadRequestException('Only online payments can fail through this endpoint');

    // Idempotency: already failed
    if (payment.status === PaymentStatus.FAILED) {
      return { success: true, status: PaymentStatus.FAILED };
    }
    if (payment.status !== PaymentStatus.CREATED || order.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException('Payment is not awaiting capture');
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId },
        data: { status: PaymentStatus.FAILED, failureReason: reason || 'SIMULATED_FAILED' },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'PAYMENT_FAILED' as any, paymentFailedAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status as any,
          toStatus: 'PAYMENT_FAILED' as any,
          actorUserId: userId,
          actorRole: 'CUSTOMER',
          note: reason || 'Payment failed',
        },
      });
      await tx.couponRedemption.updateMany({
        where: { orderId, status: CouponRedemptionStatus.RESERVED },
        data: {
          status: CouponRedemptionStatus.RELEASED,
          releasedAt: new Date(),
          releaseReason: reason || 'PAYMENT_FAILED',
        },
      });
    });

    return { success: true, status: PaymentStatus.FAILED };
  }

  async getPaymentByOrder(orderId: string, customerId?: string) {
    if (customerId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.customerId !== customerId) throw new ForbiddenException('Not allowed');
    }

    const payment = await prisma.payment.findUnique({
      where: { orderId },
      include: { refunds: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async getTotalCapturedPaise(paymentId: string): Promise<number> {
    const refunds = await prisma.refund.findMany({
      where: { paymentId, status: RefundStatus.PROCESSED },
      select: { amountPaise: true },
    });
    return refunds.reduce((sum, r) => sum + r.amountPaise, 0);
  }
}
