/**
 * Offline-customer directory, detail, tracker and reactivation.
 *
 * Split out of the former offline-customer.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';
import { reconcileSubscriptionBalance } from './subscription-balances';
import { OfflineCustomerServiceBase, OfflineCustomerActor } from './offline-customer.service.base';

export class OfflineCustomerDirectoryService extends OfflineCustomerServiceBase {
  async listCustomers(params: { search?: string; storeId?: string; storeIds?: string[]; status?: string; recycleBin?: boolean; page?: number; pageSize?: number }) {
    const { search, storeId, storeIds, status, recycleBin = false, page = 1, pageSize = 25 } = params;
    const skip = (page - 1) * pageSize;

    // Compose through AND so the offline-identity predicate survives. The old
    // spread let the recycle-bin `OR` replace it, pulling regular inactive
    // customers into the offline list and count.
    const where: Prisma.UserWhereInput = {
      AND: [
        this.offlineIdentity,
        recycleBin ? this.recycleBinState : this.activeState,
      ],
    };

    if (search) {
      const q = search.trim();
      (where.AND as Prisma.UserWhereInput[]).push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    // A store's directory also includes customers pinned to it before any
    // subscription exists, so a half-finished onboarding is still visible and
    // manageable from that store's portal. This union is the store scope; the
    // status filters below layer on top of it rather than replacing it.
    if (storeId) {
      (where.AND as Prisma.UserWhereInput[]).push({
        OR: [{ customerSubscriptions: { some: { homeStoreId: storeId } } }, { offlineStoreId: storeId }],
      });
    } else if (storeIds && storeIds.length > 0) {
      (where.AND as Prisma.UserWhereInput[]).push({
        OR: [{ customerSubscriptions: { some: { homeStoreId: { in: storeIds } } } }, { offlineStoreId: { in: storeIds } }],
      });
    }

    const storeFilter: Prisma.CustomerSubscriptionWhereInput = storeId
      ? { homeStoreId: storeId }
      : storeIds && storeIds.length > 0
      ? { homeStoreId: { in: storeIds } }
      : {};

    if (status === 'inactive') {
      where.customerSubscriptions = {
        none: {
          status: { in: ['ACTIVE', 'PENDING_CASH_COLLECTION', 'GRACE_PERIOD'] },
          ...storeFilter,
        },
      };
    } else if (status === 'active') {
      where.customerSubscriptions = { some: { status: 'ACTIVE', ...storeFilter } };
    }

    const recycleBinStorePredicate = storeId
      ? [{ OR: [{ customerSubscriptions: { some: { homeStoreId: storeId } } }, { offlineStoreId: storeId }] }]
      : storeIds && storeIds.length > 0
      ? [{ OR: [{ customerSubscriptions: { some: { homeStoreId: { in: storeIds } } } }, { offlineStoreId: { in: storeIds } }] }]
      : [];

    const hasStoreScoping = Boolean(storeId || (storeIds && storeIds.length > 0));

    const storeOrderFilter: Prisma.OrderWhereInput | undefined = storeId
      ? { storeId }
      : storeIds && storeIds.length > 0
      ? { storeId: { in: storeIds } }
      : undefined;

    const [users, total, recycleBinCount] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          addresses: { take: 1, where: { isDefault: true } },
          customerSubscriptions: {
            where: hasStoreScoping ? storeFilter : undefined,
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
          _count: {
            select: {
              orders: storeOrderFilter ? { where: storeOrderFilter } : true,
              customerSubscriptions: hasStoreScoping ? { where: storeFilter } : true,
            },
          },
          orders: {
            where: storeOrderFilter,
            take: 1,
            orderBy: { createdAt: 'desc' as const },
            select: { createdAt: true },
          },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({
        where: {
          AND: [
            this.offlineIdentity,
            this.recycleBinState,
            // The bin badge must match the store's own scope, not the global
            // recycle bin, or a store sees a count it can never act on.
            ...recycleBinStorePredicate,
          ],
        },
      }),
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
          totalSubscriptions: hasStoreScoping ? u.customerSubscriptions.length : u._count.customerSubscriptions,
          totalOrders: u._count.orders,
          totalCollectedPaise: totalCollected,
          totalDuePaise: totalDue,
          totalDelivered,
          lastOrderDate: u.orders[0]?.createdAt || null,
        },
      };
    });

    return { customers: enriched, total, recycleBinCount, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getCustomerDetail(customerId: string, actor?: OfflineCustomerActor) {
    const user = await prisma.user.findFirst({
      where: { id: customerId, AND: [this.offlineIdentity, this.ownershipFilter(actor)] },
      include: {
        addresses: true,
        _count: { select: { orders: true } },
        customerSubscriptions: {
          where: actor && actor.role !== Role.ADMIN ? { homeStore: { ownerId: actor.id } } : undefined,
          include: {
            plan: { select: { id: true, name: true, code: true, pricePaise: true } },
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

    const totalOrders = actor && actor.role !== Role.ADMIN
      ? await prisma.order.count({
          where: {
            customerId,
            store: { ownerId: actor.id },
          },
        })
      : user._count.orders;

    let overallCollectedPaise = 0;
    let overallDuePaise = 0;
    let overallDeliveredDays = 0;

    const subscriptions = user.customerSubscriptions.map((sub) => {
      const deliveredCount = sub.deliveries.filter((d) => d.status === 'DELIVERED').length;
      const pendingCount = sub.deliveries.filter((d) => d.status === 'SCHEDULED').length;
      const failedCount = sub.deliveries.filter((d) => d.status === 'FAILED').length;
      const skippedCount = sub.deliveries.filter((d) => d.status === 'SKIPPED').length;

      const amDeliveries = sub.deliveries.filter((d) => d.deliverySlot === 'AM' || d.deliverySlot === 'BOTH');
      const pmDeliveries = sub.deliveries.filter((d) => d.deliverySlot === 'PM' || d.deliverySlot === 'BOTH');

      const cycleNumber = (sub.priceSnapshot as any)?.cycleNumber || 1;
      const splitItems = (sub.priceSnapshot as any)?.splitItems || null;

      overallCollectedPaise += sub.amountCollectedPaise || 0;
      overallDuePaise += sub.amountDuePaise || 0;
      overallDeliveredDays += deliveredCount;

      return {
        ...sub,
        cycleNumber,
        splitItems,
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
      overallSummary: {
        totalCollectedPaise: overallCollectedPaise,
        totalDuePaise: overallDuePaise,
        totalDeliveredDays: overallDeliveredDays,
        totalSubscriptions: subscriptions.length,
        activeSubscriptions: subscriptions.filter((s) => ['ACTIVE', 'PENDING_CASH_COLLECTION', 'GRACE_PERIOD'].includes(s.status)).length,
      },
      totalOrders,
    };
  }

  async getDeliveryTracker(subscriptionId: string, actor?: OfflineCustomerActor) {
    if (!actor) {
      throw new ForbiddenException('Authentication required');
    }
    const subscription = await prisma.customerSubscription.findFirst({
      where: {
        id: subscriptionId,
        ...(actor.role !== Role.ADMIN
          ? { homeStore: { ownerId: actor.id } }
          : {}),
      },
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
        serviceDate: d.serviceDate,
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

    const { amountCollectedPaise: effectiveCollectedPaise, amountDuePaise: effectiveDuePaise } =
      reconcileSubscriptionBalance(subscription, subscription.deliveries);

    const summary = {
      totalDays: subscription.deliveries.length,
      deliveredDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'DELIVERED').length,
      pendingDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'SCHEDULED').length,
      failedDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'FAILED').length,
      skippedDays: subscription.deliveries.filter((d: { status: string }) => d.status === 'SKIPPED').length,
      totalAmountPaise: subscription.deliveries.reduce((sum: number, d: { cashDuePaise: number }) => sum + d.cashDuePaise, 0) + effectiveCollectedPaise,
      collectedPaise: effectiveCollectedPaise,
      duePaise: effectiveDuePaise,
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
      completedDeliveries: subscription.completedDeliveries || summary.deliveredDays,
      fundedDeliveryCount: subscription.fundedDeliveryCount || subscription.deliveries.length,
      totalDeliveries: subscription.deliveries.length,
      amountCollectedPaise: effectiveCollectedPaise,
      amountDuePaise: effectiveDuePaise,
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
