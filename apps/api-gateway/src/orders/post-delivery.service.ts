import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './order.service';

type Actor = { id: string; role: Role };
type RatingInput = { orderRating: number; storeRating?: number; riderRating?: number; comment?: string };
type SupportInput = { category: string; message: string; priority?: 'LOW' | 'NORMAL' | 'HIGH'; requestedRefund?: boolean };

function ratingValue(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new BadRequestException(`${field} must be an integer from 1 to 5`);
  }
  return Number(value);
}

@Injectable()
export class PostDeliveryService {
  constructor(private readonly orderService: OrderService) {}

  async submitRating(orderId: string, customerId: string, input: RatingInput) {
    const order = await this.customerDeliveredOrder(orderId, customerId);
    const existing = await prisma.orderStatusHistory.findFirst({
      where: { orderId, actorUserId: customerId, note: 'Customer submitted delivery rating.' },
    });
    if (existing) throw new ConflictException('Rating already submitted for this order');

    const metadata = {
      event: 'CUSTOMER_RATING_SUBMITTED',
      orderRating: ratingValue(input.orderRating, 'orderRating'),
      storeRating: input.storeRating == null ? null : ratingValue(input.storeRating, 'storeRating'),
      riderRating: input.riderRating == null ? null : ratingValue(input.riderRating, 'riderRating'),
      comment: input.comment?.trim() || null,
      storeId: order.storeId,
      riderProfileId: order.riderId || null,
      submittedAt: new Date().toISOString(),
    };

    await this.orderService.recordStatusHistory({
      orderId,
      fromStatus: OrderStatus.DELIVERED,
      toStatus: OrderStatus.DELIVERED,
      actor: { id: customerId, role: Role.CUSTOMER },
      note: 'Customer submitted delivery rating.',
      metadata,
    });
    return { ok: true, rating: metadata };
  }

  async createSupportTicket(orderId: string, customerId: string, input: SupportInput) {
    const order = await this.customerOrder(orderId, customerId);
    const category = input.category?.trim();
    const message = input.message?.trim();
    if (!category) throw new BadRequestException('category is required');
    if (!message || message.length < 5) throw new BadRequestException('message must be at least 5 characters');

    const existingOpen = await prisma.orderStatusHistory.findFirst({
      where: {
        orderId,
        actorUserId: customerId,
        note: 'Customer opened support ticket.',
        metadata: { path: ['status'], equals: 'OPEN' } as any,
      },
    });
    if (existingOpen) throw new ConflictException('An open support ticket already exists for this order');

    const metadata = {
      event: 'CUSTOMER_SUPPORT_TICKET_OPENED',
      status: 'OPEN',
      category,
      message,
      priority: input.priority || 'NORMAL',
      requestedRefund: Boolean(input.requestedRefund),
      orderStatus: order.status,
      createdAt: new Date().toISOString(),
    };

    const ticket = await this.orderService.recordStatusHistory({
      orderId,
      fromStatus: order.status as OrderStatus,
      toStatus: order.status as OrderStatus,
      actor: { id: customerId, role: Role.CUSTOMER },
      note: 'Customer opened support ticket.',
      metadata,
    });
    return { ok: true, ticketId: ticket.id, ticket: metadata };
  }

  async listMyPostDelivery(orderId: string, customerId: string) {
    await this.customerOrder(orderId, customerId);
    return this.postDeliveryPayload(orderId);
  }

  async adminSupportQueue(actor: Actor) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only admin can view support queue');
    const rows = await prisma.orderStatusHistory.findMany({
      where: { note: 'Customer opened support ticket.' },
      include: { order: { include: { customer: { select: { name: true, email: true, phone: true } }, store: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      createdAt: row.createdAt,
      customer: row.order.customer,
      store: row.order.store,
      metadata: row.metadata,
    }));
  }

  private async postDeliveryPayload(orderId: string) {
    const rows = await prisma.orderStatusHistory.findMany({
      where: { orderId, note: { in: ['Customer submitted delivery rating.', 'Customer opened support ticket.'] } },
      orderBy: { createdAt: 'desc' },
    });
    const rating = rows.find((row) => row.note === 'Customer submitted delivery rating.') || null;
    const tickets = rows.filter((row) => row.note === 'Customer opened support ticket.');
    return { rating, tickets };
  }

  private async customerOrder(orderId: string, customerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== customerId) throw new ForbiddenException('Not allowed');
    return order;
  }

  private async customerDeliveredOrder(orderId: string, customerId: string) {
    const order = await this.customerOrder(orderId, customerId);
    if (order.status !== OrderStatus.DELIVERED) throw new BadRequestException('Ratings are allowed only after delivery');
    return order;
  }
}
