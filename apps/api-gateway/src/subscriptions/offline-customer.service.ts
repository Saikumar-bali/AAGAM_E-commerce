import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';
import { randomUUID } from 'crypto';

@Injectable()
export class OfflineCustomerService {

  async listCustomers(params: { search?: string; storeId?: string; status?: string; page?: number; pageSize?: number }) {
    const { search, storeId, status, page = 1, pageSize = 25 } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      role: Role.CUSTOMER,
      OR: [
        { email: { startsWith: 'offline.' } },
        { acquisitionSource: 'OFFLINE' },
        { customerSubscriptions: { some: { source: { in: ['manual', 'custom_manual'] } } } },
      ],
    };

    if (search) {
      const q = search.trim();
      where.AND = [
        {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (status === 'inactive') {
      where.customerSubscriptions = {
        none: {
          status: { in: ['ACTIVE', 'PENDING_CASH_COLLECTION', 'GRACE_PERIOD'] },
          ...(storeId ? { homeStoreId: storeId } : {}),
        },
      };
    } else {
      const subConditions: Record<string, unknown> = {};
      if (storeId) subConditions.homeStoreId = storeId;
      if (status === 'active') subConditions.status = 'ACTIVE';
      if (Object.keys(subConditions).length > 0) {
        where.customerSubscriptions = { some: subConditions };
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          addresses: { take: 1, where: { isDefault: true } },
          customerSubscriptions: {
            select: {
              id: true,
              status: true,
              startDate: true,
              endDate: true,
              completedDeliveries: true,
              failedDeliveries: true,
              skippedDeliveries: true,
              amountDuePaise: true,
              amountCollectedPaise: true,
              isCustom: true,
              storeDelivery: true,
              homeStore: { select: { id: true, name: true } },
              _count: { select: { deliveries: true, orders: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: { select: { orders: true, customerSubscriptions: true } },
          orders: { take: 1, orderBy: { createdAt: 'desc' as const }, select: { createdAt: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const enriched = users.map((u) => {
      const activeSubs = u.customerSubscriptions.filter((s) => ['ACTIVE', 'PENDING_CASH_COLLECTION', 'GRACE_PERIOD'].includes(s.status));
      const totalCollected = u.customerSubscriptions.reduce((sum, s) => sum + s.amountCollectedPaise, 0);
      const totalDue = u.customerSubscriptions.reduce((sum, s) => sum + s.amountDuePaise, 0);
      const totalDelivered = u.customerSubscriptions.reduce((sum, s) => sum + s.completedDeliveries, 0);

      return {
        ...u,
        summary: {
          activeSubscriptions: activeSubs.length,
          totalSubscriptions: u._count.customerSubscriptions,
          totalOrders: u._count.orders,
          totalCollectedPaise: totalCollected,
          totalDuePaise: totalDue,
          totalDelivered,
          lastOrderDate: u.orders[0]?.createdAt || null,
        },
      };
    });

    return { customers: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getCustomerDetail(customerId: string) {
    const user = await prisma.user.findUnique({
      where: { id: customerId },
      include: {
        addresses: true,
        _count: { select: { orders: true } },
        customerSubscriptions: {
          include: {
            deliveries: { orderBy: { sequenceNumber: 'asc' } },
            orders: {
              select: {
                id: true,
                status: true,
                grandTotalPaise: true,
                orderSource: true,
                createdAt: true,
                deliveredAt: true,
                items: { select: { product: { select: { name: true } }, quantity: true, lineTotalPaise: true } },
              },
            },
            homeStore: { select: { id: true, name: true, address: true } },
            _count: { select: { deliveries: true, orders: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) throw new NotFoundException('Customer not found');

    const subscriptions = user.customerSubscriptions.map((sub) => {
      const deliveredCount = sub.deliveries.filter((d) => d.status === 'DELIVERED').length;
      const pendingCount = sub.deliveries.filter((d) => d.status === 'SCHEDULED').length;
      const failedCount = sub.deliveries.filter((d) => d.status === 'FAILED').length;
      const skippedCount = sub.deliveries.filter((d) => d.status === 'SKIPPED').length;

      const amDeliveries = sub.deliveries.filter((d) => d.deliverySlot === 'AM' || d.deliverySlot === 'BOTH');
      const pmDeliveries = sub.deliveries.filter((d) => d.deliverySlot === 'PM' || d.deliverySlot === 'BOTH');

      return {
        ...sub,
        stats: {
          delivered: deliveredCount,
          pending: pendingCount,
          failed: failedCount,
          skipped: skippedCount,
          totalDays: sub.deliveries.length,
          amDeliveries: amDeliveries.length,
          pmDeliveries: pmDeliveries.length,
        },
      };
    });

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      createdAt: user.createdAt,
      addresses: user.addresses,
      subscriptions,
      totalOrders: user._count.orders,
    };
  }

  async getDeliveryTracker(subscriptionId: string) {
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        homeStore: { select: { id: true, name: true } },
        address: true,
        deliveries: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            order: {
              select: {
                id: true,
                status: true,
                grandTotalPaise: true,
                orderSource: true,
                createdAt: true,
                deliveredAt: true,
                items: {
                  select: {
                    product: { select: { name: true } },
                    quantity: true,
                    lineTotalPaise: true,
                    unitPricePaise: true,
                  },
                },
              },
            },
            storeDeliveryProof: true,
          },
        },
      },
    });

    if (!subscription) throw new NotFoundException('Subscription not found');

    const deliveries = subscription.deliveries.map((d) => {
      const isAm = d.deliverySlot === 'AM' || d.deliverySlot === 'BOTH';
      const isPm = d.deliverySlot === 'PM' || d.deliverySlot === 'BOTH';

      return {
        id: d.id,
        date: d.serviceDate,
        sequenceNumber: d.sequenceNumber,
        deliverySlot: d.deliverySlot,
        status: d.status,
        cashDuePaise: d.cashDuePaise,
        cashCollectedPaise: d.cashCollectedPaise,
        cashCollectedAt: d.cashCollectedAt,
        deliveredAt: d.deliveredAt,
        failureReason: d.failureReason,
        skipReason: d.skipReason,
        deliveredByStoreUserId: d.deliveredByStoreUserId,
        amStatus: isAm ? d.status : null,
        pmStatus: isPm ? d.status : null,
        order: d.order
          ? {
              id: d.order.id,
              status: d.order.status,
              grandTotalPaise: d.order.grandTotalPaise,
              createdAt: d.order.createdAt,
              deliveredAt: d.order.deliveredAt,
              items: d.order.items.map((i) => ({
                name: i.product.name,
                quantity: i.quantity,
                pricePaise: i.lineTotalPaise,
              })),
            }
          : null,
        storeDeliveryProof: d.storeDeliveryProof,
      };
    });

    const summary = {
      totalDays: subscription.deliveries.length,
      deliveredDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'DELIVERED').length,
      pendingDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'SCHEDULED').length,
      failedDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'FAILED').length,
      skippedDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'SKIPPED').length,
      totalAmountPaise: subscription.deliveries.reduce((sum: number, d: { cashDuePaise: number }) => sum + d.cashDuePaise, 0) + subscription.amountCollectedPaise,
      collectedPaise: subscription.amountCollectedPaise,
      duePaise: subscription.amountDuePaise,
    };

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isCustom: subscription.isCustom,
        storeDelivery: subscription.storeDelivery,
        source: subscription.source,
      },
      customer: subscription.customer,
      store: subscription.homeStore,
      address: subscription.address,
      summary,
      deliveries,
    };
  }

  async reactivateCustomer(customerId: string, storeId: string, actorId: string) {
    const user = await prisma.user.findUnique({
      where: { id: customerId },
      include: {
        addresses: { where: { isDefault: true }, take: 1 },
        customerSubscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });

    if (!user) throw new NotFoundException('Customer not found');
    if (!user.addresses[0]) throw new BadRequestException('Customer has no default address');

    return {
      customer: { id: user.id, name: user.name, phone: user.phone },
      address: user.addresses[0],
      lastSubscription: user.customerSubscriptions[0]
        ? { id: user.customerSubscriptions[0].id, planName: user.customerSubscriptions[0].plan.name, status: user.customerSubscriptions[0].status }
        : null,
      message: 'Customer is ready for reactivation. Create a new subscription.',
    };
  }
}
