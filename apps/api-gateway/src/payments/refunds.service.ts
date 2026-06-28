import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, RefundStatus, prisma } from '@aagam/database';

interface CreateRefundInput {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  reason: string;
  requestedByUserId?: string;
}

@Injectable()
export class RefundsService {
  async createRefundForPayment(input: CreateRefundInput, tx?: any) {
    const client = tx || prisma;

    const payment = await client.payment.findUnique({
      where: { id: input.paymentId },
      include: { refunds: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status !== PaymentStatus.CAPTURED && payment.status !== PaymentStatus.REFUND_PENDING) {
      throw new BadRequestException(`Refund is not allowed for payment in status ${payment.status}`);
    }

    if (!Number.isInteger(input.amountPaise) || input.amountPaise < 1) {
      throw new BadRequestException('Refund amount must be a positive integer (paise)');
    }

    const existingNonFailedRefunds = payment.refunds.filter(
      (r: any) => r.status !== RefundStatus.FAILED,
    );
    const totalExistingRefundPaise = existingNonFailedRefunds.reduce(
      (sum: number, r: any) => sum + r.amountPaise,
      0,
    );

    if (totalExistingRefundPaise + input.amountPaise > payment.amountPaise) {
      throw new BadRequestException(
        `Refund amount ${input.amountPaise} paise would exceed captured amount ${payment.amountPaise} paise (existing refunds: ${totalExistingRefundPaise} paise)`,
      );
    }

    // Check for duplicate full refund for the same cancelled order
    if (input.amountPaise === payment.amountPaise) {
      const existingFullRefund = existingNonFailedRefunds.find(
        (r: any) => r.amountPaise === payment.amountPaise,
      );
      if (existingFullRefund) {
        throw new BadRequestException('A full refund for this payment has already been initiated');
      }
    }

    await client.payment.update({
      where: { id: input.paymentId },
      data: { status: PaymentStatus.REFUND_PENDING as any },
    });

    const refund = await client.refund.create({
      data: {
        orderId: input.orderId,
        paymentId: input.paymentId,
        amountPaise: input.amountPaise,
        status: RefundStatus.PENDING,
        reason: input.reason,
        requestedByUserId: input.requestedByUserId || null,
      },
    });

    return refund;
  }
}
