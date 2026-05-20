import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, prisma } from '@aagam/database';

@Injectable()
export class PaymentsService {
  async captureSimulatedPayment(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true, status: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not allowed');

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.method !== PaymentMethod.ONLINE) throw new BadRequestException('Only online payments can be captured');
    if (payment.status === PaymentStatus.CAPTURED) {
      return { success: true, status: PaymentStatus.CAPTURED };
    }
    if (payment.status !== PaymentStatus.CREATED || order.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException('Payment is not awaiting capture');
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId },
        data: { status: PaymentStatus.CAPTURED, verifiedAt: new Date() },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED' as any },
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
        data: { status: 'PAYMENT_FAILED' as any },
      });
    });

    return { success: true, status: PaymentStatus.FAILED };
  }
}
