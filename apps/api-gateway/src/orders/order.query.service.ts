/**
 * Order listing and detail queries.
 *
 * Split out of the former order.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderServiceBase } from './order.service.base';

export class OrderQueryService extends OrderServiceBase {
  async findAll() {
    return prisma.order.findMany({
      include: {
        customer: {
          select: { name: true, email: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
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
        },
        payment: { select: { method: true, status: true, amountPaise: true } },
        codLedger: {
          select: {
            expectedAmountPaise: true,
            collectedAmountPaise: true,
            riderHoldingBalancePaise: true,
            depositedAmountPaise: true,
            status: true,
          },
        },
        deliveryJob: { select: { id: true, status: true } },
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findOne(id: string, actor?: { id: string; role: Role }) {
    const order = await prisma.order.findUnique({
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
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!actor) return order;

    if (actor.role === Role.CUSTOMER && order.customerId !== actor.id) {
      throw new ForbiddenException('Not allowed');
    }
    if (actor.role === Role.RIDER) {
      const riderProfile = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
      if (!riderProfile || order.riderId !== riderProfile.id) {
        throw new ForbiddenException('Not allowed');
      }
    }
    if (actor.role === Role.STORE_OWNER) {
      if (order.store.ownerId !== actor.id) {
        throw new ForbiddenException('Not allowed');
      }
    }
    return order;
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

  async findStoreOrders(ownerId: string) {
    const stores = await prisma.store.findMany({
      where: { ownerId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);
    if (storeIds.length === 0) return [];

    return prisma.order.findMany({
      where: { storeId: { in: storeIds } },
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        payment: true,
        items: {
          include: {
            product: { select: { name: true, image: true } },
          },
        },
        rider: {
          include: {
            user: { select: { name: true } },
          },
        },
        subscription: {
          select: {
            id: true,
            planVersion: { select: { pricePaise: true } },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMyOrders(userId: string) {
    return prisma.order.findMany({
      where: { customerId: userId },
      include: {
        store: {
          select: { id: true, name: true, address: true, owner: { select: { phone: true, name: true } } }
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
    const orders = await prisma.order.findMany({
      where: { riderId },
      include: {
        customer: {
          select: { name: true, phone: true }
        },
        store: {
          select: { name: true, address: true, latitude: true, longitude: true }
        },
        payment: true,
        items: {
          include: {
            product: {
              select: { name: true, image: true }
            }
          }
        },
        riderLocationPings: {
          select: { latitude: true, longitude: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 400,
        },
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    return orders.map((order) => {
      const tripSummary = this.computeTripSummary(order.riderLocationPings, order.outForDeliveryAt, order.deliveredAt);
      return {
        ...order,
        trackingSummary: tripSummary,
      };
    });
  }

  async findRecentForRiders(since: Date) {
    return prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.PICKING, OrderStatus.PACKED] },
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
