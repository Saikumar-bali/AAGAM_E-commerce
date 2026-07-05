import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './order.service';

const ACTIVE_RIDER_ORDER_STATUSES = [OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY];
const DISPATCH_ASSIGNABLE_STATUSES = [OrderStatus.PACKED];

type Actor = { id: string; role: Role };

@Injectable()
export class DispatchService {
  constructor(private readonly orderService: OrderService) {}

  async getBoard(actor: Actor) {
    const storeWhere = actor.role === Role.STORE_OWNER ? { ownerId: actor.id } : {};
    const stores = await prisma.store.findMany({ where: storeWhere, select: { id: true } });
    const storeIds = stores.map((store) => store.id);

    const orders = await prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PACKED, OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY] },
        ...(actor.role === Role.STORE_OWNER ? { storeId: { in: storeIds } } : {}),
      },
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        store: { select: { id: true, name: true, ownerId: true, address: true, latitude: true, longitude: true } },
        rider: { include: { user: { select: { id: true, name: true, phone: true, email: true } } } },
        items: { include: { product: { select: { name: true, image: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const riders = await prisma.riderProfile.findMany({
      where: { status: { in: ['ONLINE', 'BUSY'] as any } },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    const activeOrders = await prisma.order.groupBy({
      by: ['riderId'],
      where: { riderId: { not: null }, status: { in: ACTIVE_RIDER_ORDER_STATUSES } },
      _count: { _all: true },
    });
    const activeByRiderId = new Map(activeOrders.map((row) => [row.riderId, row._count._all]));

    return {
      waitingForRider: orders.filter((order) => order.status === OrderStatus.PACKED && !order.riderId),
      activeDeliveries: orders.filter((order) => order.status === OrderStatus.RIDER_ASSIGNED || order.status === OrderStatus.OUT_FOR_DELIVERY),
      riders: riders.map((rider) => ({ ...rider, activeOrderCount: activeByRiderId.get(rider.id) || 0, available: rider.status === 'ONLINE' && (activeByRiderId.get(rider.id) || 0) === 0 })),
    };
  }

  async assignPackedOrder(orderId: string, riderUserId: string, actor: Actor) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException('Only admin or store owner can assign riders');
    }

    const riderUser = await prisma.user.findUnique({ where: { id: riderUserId } });
    if (!riderUser || riderUser.role !== Role.RIDER) throw new BadRequestException('User is not a rider');

    const rider = await prisma.riderProfile.findUnique({ where: { userId: riderUserId } });
    if (!rider) throw new NotFoundException('Rider profile not found');
    if (rider.status === 'OFFLINE') throw new BadRequestException('Rider is offline');

    const activeOrder = await prisma.order.findFirst({
      where: { riderId: rider.id, status: { in: ACTIVE_RIDER_ORDER_STATUSES } },
      select: { id: true, status: true },
    });
    if (activeOrder) throw new ConflictException(`Rider already has active order ${activeOrder.id}`);

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (actor.role === Role.STORE_OWNER && order.store.ownerId !== actor.id) {
      throw new ForbiddenException('Not allowed to assign rider for this store');
    }
    if (!DISPATCH_ASSIGNABLE_STATUSES.includes(order.status as OrderStatus)) {
      throw new BadRequestException('Only ready-for-pickup orders can be assigned');
    }
    if (order.riderId) throw new ConflictException('Order already has a rider');

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.RIDER_ASSIGNED, riderId: rider.id, riderAssignedAt: new Date() } });
      await this.orderService.recordStatusHistory({
        orderId,
        fromStatus: order.status as OrderStatus,
        toStatus: OrderStatus.RIDER_ASSIGNED,
        actor,
        note: 'Dispatcher assigned rider to ready order.',
        metadata: { riderProfileId: rider.id, riderUserId },
      }, tx);
      await tx.riderProfile.update({ where: { id: rider.id }, data: { status: 'BUSY' } });
      return next;
    });

    return updated;
  }

  async acceptAssignment(orderId: string, riderUserId: string) {
    const { order, rider } = await this.assignedOrder(orderId, riderUserId);
    if (order.status !== OrderStatus.RIDER_ASSIGNED) throw new BadRequestException('Assignment is not active');
    await this.orderService.recordStatusHistory({
      orderId,
      fromStatus: order.status as OrderStatus,
      toStatus: order.status as OrderStatus,
      actor: { id: riderUserId, role: Role.RIDER },
      note: 'Rider accepted the assignment.',
      metadata: { riderProfileId: rider.id, event: 'RIDER_ACCEPTED_ASSIGNMENT' },
    });
    return this.orderService.findOne(orderId, { id: riderUserId, role: Role.RIDER });
  }

  async rejectAssignment(orderId: string, riderUserId: string, reason?: string) {
    const { order, rider } = await this.assignedOrder(orderId, riderUserId);
    if (order.status !== OrderStatus.RIDER_ASSIGNED) throw new BadRequestException('Only assigned orders can be rejected');

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.PACKED, riderId: null, riderAssignedAt: null } });
      await this.orderService.recordStatusHistory({
        orderId,
        fromStatus: OrderStatus.RIDER_ASSIGNED,
        toStatus: OrderStatus.PACKED,
        actor: { id: riderUserId, role: Role.RIDER },
        note: 'Rider rejected the assignment.',
        metadata: { riderProfileId: rider.id, reason: reason || null, event: 'RIDER_REJECTED_ASSIGNMENT' },
      }, tx);
      await tx.riderProfile.update({ where: { id: rider.id }, data: { status: 'ONLINE' } });
      return next;
    });
    return updated;
  }

  async markPickedUp(orderId: string, riderUserId: string) {
    const { order } = await this.assignedOrder(orderId, riderUserId);
    if (order.status !== OrderStatus.RIDER_ASSIGNED) throw new BadRequestException('Only assigned orders can be picked up');
    return this.orderService.updateStatus(orderId, OrderStatus.OUT_FOR_DELIVERY, { id: riderUserId, role: Role.RIDER });
  }

  private async assignedOrder(orderId: string, riderUserId: string) {
    const rider = await prisma.riderProfile.findUnique({ where: { userId: riderUserId } });
    if (!rider) throw new NotFoundException('Rider profile not found');
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, riderId: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.riderId !== rider.id) throw new ForbiddenException('You can only manage your assigned orders');
    return { order, rider };
  }
}
