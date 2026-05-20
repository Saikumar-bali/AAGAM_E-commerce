import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  PAYMENT_PENDING: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
  CONFIRMED: ['PICKING', 'CANCELLED'],
  PICKING: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class OrderService {
  async findAll() {
    return prisma.order.findMany({
      include: {
        customer: {
          select: { name: true, email: true }
        },
        store: {
          select: { name: true }
        },
        items: {
          include: {
            product: {
              select: { name: true }
            }
          }
        },
        rider: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findOne(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        store: true,
        items: {
          include: { product: true }
        },
        rider: {
          include: { user: true }
        }
      }
    });
  }

  async findMyOrder(userId: string, id: string) {
    const order = await prisma.order.findFirst({
      where: { id, customerId: userId },
      include: {
        store: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
        payment: true,
        rider: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

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

    const allowedNextStatuses = ORDER_TRANSITIONS[order.status as OrderStatus] || [];
    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(`Cannot transition order from ${order.status} to ${nextStatus}`);
    }

    if (actor.role === Role.RIDER) {
      const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
      if (!riderProfile || order.riderId !== riderProfile.id) {
        throw new ForbiddenException('You can only update your assigned orders');
      }

      const riderAllowed: OrderStatus[] = [OrderStatus.PICKING, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
      if (!riderAllowed.includes(nextStatus)) {
        throw new ForbiddenException('Riders can only progress active deliveries');
      }
    }

    if (actor.role === Role.STORE_OWNER) {
      if (order.store?.ownerId !== actor.id) {
        throw new ForbiddenException('Not allowed to update orders for this store');
      }
      const ownerAllowed: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PICKING, OrderStatus.CANCELLED];
      if (!ownerAllowed.includes(nextStatus)) {
        throw new ForbiddenException('Store owners can only confirm, begin picking, or cancel');
      }
    }

    const data: any = { status: nextStatus };
    if (riderId) {
      data.riderId = riderId;
    }

    const updated = await prisma.order.update({
      where: { id },
      data,
    });

    if (updated.riderId && nextStatus === OrderStatus.DELIVERED) {
      await prisma.riderProfile.update({
        where: { id: updated.riderId },
        data: { status: 'ONLINE' },
      }).catch(() => null);
    }

    return updated;
  }

  async assignRider(orderId: string, userId: string) {
    const riderProfile = await prisma.riderProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        status: 'OFFLINE',
      },
    });

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, riderId: true },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException('Only confirmed orders can be assigned to riders');
      }
      if (order.riderId) {
        throw new ConflictException('Order already assigned to a rider');
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PICKING,
          riderId: riderProfile.id,
        },
      });

      await tx.riderProfile.update({
        where: { id: riderProfile.id },
        data: { status: 'BUSY' },
      });

      return updated;
    });
  }

  async findMyOrders(userId: string) {
    return prisma.order.findMany({
      where: { customerId: userId },
      include: {
        store: {
          select: { name: true }
        },
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findByRiderId(riderId: string) {
    return prisma.order.findMany({
      where: { riderId },
      include: {
        customer: {
          select: { name: true, phone: true }
        },
        store: {
          select: { name: true, address: true }
        },
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findRecentForRiders(since: Date) {
    return prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: 'CONFIRMED',
        riderId: null,
      },
      include: {
        customer: {
          select: { name: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
        },
        rider: true,
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50,
    });
  }

  async findOneWithDetails(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        customer: {
          select: { name: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
        },
        rider: {
          include: { user: { select: { name: true } } }
        },
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        }
      }
    });
  }
}
