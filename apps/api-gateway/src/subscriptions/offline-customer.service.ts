import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';
import { startOfUtcDay } from './subscription-calendar.service';

export type OfflineCustomerActor = { id: string; role: Role };

@Injectable()
export class OfflineCustomerService {
  /**
   * Authoritative marker identifying an offline-created customer. Kept as a
   * single predicate so every read and mutation applies the same rule; it must
   * be composed with `AND` rather than spread, since a sibling `OR` would
   * silently replace it.
   */
  private readonly offlineIdentity: Prisma.UserWhereInput = {
    role: Role.CUSTOMER,
    OR: [
      { email: { startsWith: 'offline.', endsWith: '@aagaam.local' } },
      // 'OFFLINE' is the legacy value; store-created customers are stamped
      // 'OFFLINE_STORE', so both must match for the segment to stay queryable.
      { acquisitionSource: { in: ['OFFLINE', 'OFFLINE_STORE'] } },
      { offlineStoreId: { not: null } },
      {
        customerSubscriptions: {
          some: {
            OR: [
              { source: { in: ['manual', 'custom_manual'] } },
              { deliveryMethod: 'PERSONAL_HANDOVER' },
              { isCustom: true },
              { storeDelivery: true },
            ],
          },
        },
      },
    ],
  };

  private readonly recycleBinState: Prisma.UserWhereInput = {
    OR: [{ isActive: false }, { deactivatedAt: { not: null } }],
    // A purged customer is anonymized rather than deleted when historical
    // orders must be retained. It is archived for financial records and must
    // not resurface as a restorable recycle-bin entry.
    NOT: { deactivationReason: 'PERMANENTLY_PURGED' },
  };

  private readonly activeState: Prisma.UserWhereInput = {
    isActive: true,
    deactivatedAt: null,
  };

  /**
   * Marks the subscription pause that {@link moveToRecycleBin} applies, so
   * restore only lifts *its own* pause and leaves a genuine customer-requested
   * or admin pause intact (`pauseReason` is the only discriminator the schema
   * offers for that distinction).
   */
  private static readonly RECYCLE_BIN_PAUSE_PREFIX = 'OFFLINE_CUSTOMER_IN_RECYCLE_BIN:';
  private static readonly RECYCLE_BIN_PAUSE_REASON = 'OFFLINE_CUSTOMER_IN_RECYCLE_BIN';

  /**
   * Builds the ownership predicate for reads. An ADMIN may view any offline
   * customer; a STORE_OWNER only those belonging to a store they own. Ownership
   * is derived from the subscription's home store (the same rule the list
   * endpoints already use), with `User.offlineStoreId` as a secondary link so a
   * store's customer is manageable even before its first subscription exists.
   */
  private ownershipFilter(actor?: OfflineCustomerActor): Prisma.UserWhereInput {
    if (!actor || actor.role === Role.ADMIN) return {};
    if (actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException('Only the owning store can manage offline customers');
    }
    return {
      OR: [
        { customerSubscriptions: { some: { homeStore: { ownerId: actor.id } } } },
        { offlineStore: { ownerId: actor.id } },
      ],
    };
  }

  /**
   * Delete/restore/purge are store-owned operations: the store portal is the
   * only place that may change an offline customer's lifecycle, so an ADMIN is
   * rejected even though it can still read the directory.
   */
  private mutationOwnershipFilter(actor?: OfflineCustomerActor): Prisma.UserWhereInput {
    if (!actor || actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException('Only the store that owns the customer can delete or restore it');
    }
    return this.ownershipFilter(actor);
  }

  /**
   * Loads a customer that is both offline-provenance and in the expected
   * lifecycle state, scoped to the actor's store. Without the ownership check a
   * store owner could deactivate, restore, or anonymize another store's
   * customer by guessing an id.
   */
  private async loadOfflineCustomer(
    customerId: string,
    expected: 'active' | 'recycleBin' | 'any',
    actor?: OfflineCustomerActor,
    mutation = false,
  ) {
    const lifecycleFilter =
      expected === 'active'
        ? this.activeState
        : expected === 'recycleBin'
        ? this.recycleBinState
        : {};
    const identityFilter =
      expected === 'any' && mutation && actor?.role === Role.STORE_OWNER
        ? {
            role: Role.CUSTOMER,
            OR: [
              this.offlineIdentity,
              { customerSubscriptions: { some: { homeStore: { ownerId: actor.id } } } },
              { offlineStore: { ownerId: actor.id } },
            ],
          }
        : this.offlineIdentity;
    const user = await prisma.user.findFirst({
      where: {
        id: customerId,
        AND: [
          identityFilter,
          lifecycleFilter,
          mutation ? this.mutationOwnershipFilter(actor) : this.ownershipFilter(actor),
        ],
      },
      select: { id: true, isActive: true, deactivatedAt: true },
    });
    if (!user) {
      throw new NotFoundException('Offline customer not found');
    }
    return user;
  }

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

    const totalCashCollectedOnDeliveries = subscription.deliveries.reduce((sum: number, d: { cashCollectedPaise?: number | null }) => sum + (d.cashCollectedPaise || 0), 0);
    const effectiveCollectedPaise = Math.max(subscription.amountCollectedPaise || 0, totalCashCollectedOnDeliveries);
    const effectiveDuePaise = Math.max(0, (subscription.amountDuePaise || 0) - (effectiveCollectedPaise - (subscription.amountCollectedPaise || 0)));

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

  async moveToRecycleBin(customerId: string, reason?: string, actor?: OfflineCustomerActor) {
    // Only an active offline customer may be binned, and only by its owner or admin.
    await this.loadOfflineCustomer(customerId, 'active', actor, true);

    if (actor && actor.role !== Role.ADMIN) {
      const otherStoreSubscription = await prisma.customerSubscription.findFirst({
        where: {
          customerId,
          homeStore: { ownerId: { not: actor.id } },
        },
        select: { id: true },
      });
      if (otherStoreSubscription) {
        throw new ForbiddenException('Cannot move customer to Recycle Bin because they have subscriptions at another store');
      }
      const otherStoreOrder = await prisma.order.findFirst({
        where: {
          customerId,
          store: { ownerId: { not: actor.id } },
        },
        select: { id: true },
      });
      if (otherStoreOrder) {
        throw new ForbiddenException('Cannot move customer to Recycle Bin because they have orders at another store');
      }
    }

    const activeSubs = await prisma.customerSubscription.findMany({
      where: {
        customerId,
        status: { in: ['ACTIVE', 'PENDING_CASH_COLLECTION', 'GRACE_PERIOD', 'PAYMENT_DUE'] },
        ...(actor && actor.role !== Role.ADMIN ? { homeStore: { ownerId: actor.id } } : {}),
      },
      select: { id: true, status: true },
    });

    const pauseEffectiveFrom = startOfUtcDay(new Date());

    // Both writes must land together: deactivating the user while leaving the
    // subscriptions ACTIVE would keep them in dispatch, and pausing the
    // subscriptions without deactivating the user would hide the failure.
    // `pauseEffectiveFrom` is stamped to start of day so the order generator defers
    // every still-scheduled occurrence for the duration of the bin.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: customerId },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivationReason: reason || 'DELETED_TO_RECYCLE_BIN',
        },
      }),
      ...activeSubs.map((sub) =>
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            status: 'PAUSED',
            pausedAt: new Date(),
            pauseEffectiveFrom,
            pauseReason: `${OfflineCustomerService.RECYCLE_BIN_PAUSE_PREFIX}${sub.status}`,
          },
        }),
      ),
    ]);

    return {
      success: true,
      message: 'Offline customer moved to Recycle Bin',
      customerId,
    };
  }

  async restoreFromRecycleBin(customerId: string, actor?: OfflineCustomerActor) {
    // Restore is only valid for an offline customer already in the bin.
    // `recycleBinState` excludes purged rows, so a purged customer cannot be
    // restored here.
    await this.loadOfflineCustomer(customerId, 'recycleBin', actor, true);

    if (actor && actor.role !== Role.ADMIN) {
      const otherStoreSubscription = await prisma.customerSubscription.findFirst({
        where: {
          customerId,
          homeStore: { ownerId: { not: actor.id } },
        },
        select: { id: true },
      });
      if (otherStoreSubscription) {
        throw new ForbiddenException('Cannot restore customer because they have subscriptions at another store');
      }
      const otherStoreOrder = await prisma.order.findFirst({
        where: {
          customerId,
          store: { ownerId: { not: actor.id } },
        },
        select: { id: true },
      });
      if (otherStoreOrder) {
        throw new ForbiddenException('Cannot restore customer because they have orders at another store');
      }
    }

    const pausedSubs = await prisma.customerSubscription.findMany({
      where: {
        customerId,
        status: 'PAUSED',
        OR: [
          { pauseReason: { startsWith: OfflineCustomerService.RECYCLE_BIN_PAUSE_PREFIX } },
          { pauseReason: OfflineCustomerService.RECYCLE_BIN_PAUSE_REASON },
        ],
        ...(actor && actor.role !== Role.ADMIN ? { homeStore: { ownerId: actor.id } } : {}),
      },
      select: {
        id: true,
        pauseReason: true,
        pauseEffectiveFrom: true,
        pausedAt: true,
        remainingFundedDeliveries: true,
        endDate: true,
        nextDeliveryDate: true,
      },
    });

    const now = new Date();

    // Mirror moveToRecycleBin: reactivate the customer, restore prior subscription statuses,
    // and shift deliveries that were paused while in the recycle bin.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: customerId },
        data: {
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
        },
      });

      for (const sub of pausedSubs) {
        let priorStatus = 'ACTIVE';
        if (sub.pauseReason?.startsWith(OfflineCustomerService.RECYCLE_BIN_PAUSE_PREFIX)) {
          priorStatus = sub.pauseReason.slice(OfflineCustomerService.RECYCLE_BIN_PAUSE_PREFIX.length);
        } else {
          priorStatus = (sub.remainingFundedDeliveries ?? 0) > 0 ? 'ACTIVE' : 'PAYMENT_DUE';
        }

        const nowUtc = startOfUtcDay(now);
        const effectiveUtc = startOfUtcDay(sub.pauseEffectiveFrom ?? sub.pausedAt ?? now);
        const shiftDays = Math.max(0, Math.round((nowUtc.getTime() - effectiveUtc.getTime()) / 86_400_000));

        if (shiftDays > 0) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "SubscriptionDelivery"
            SET "serviceDate" = "serviceDate" + (${shiftDays} * INTERVAL '1 day'),
                "rescheduledFromDate" = COALESCE("rescheduledFromDate", "serviceDate"),
                "rescheduledToDate" = "serviceDate" + (${shiftDays} * INTERVAL '1 day'),
                "updatedAt" = NOW()
            WHERE "subscriptionId" = ${sub.id}
              AND "status" = 'SCHEDULED'::"SubscriptionDeliveryStatus"
              AND "serviceDate" >= ${effectiveUtc}
          `);
        }

        const latest = await tx.subscriptionDelivery.findFirst({
          where: { subscriptionId: sub.id },
          orderBy: { serviceDate: 'desc' },
        });
        const next = await tx.subscriptionDelivery.findFirst({
          where: {
            subscriptionId: sub.id,
            status: 'SCHEDULED',
            serviceDate: { gte: now },
          },
          orderBy: { serviceDate: 'asc' },
        });

        await tx.customerSubscription.update({
          where: { id: sub.id },
          data: {
            status: priorStatus as any,
            pausedAt: null,
            pauseEffectiveFrom: null,
            pauseReason: null,
            resumedAt: now,
            endDate: latest?.serviceDate ?? sub.endDate,
            nextDeliveryDate: next?.serviceDate ?? sub.nextDeliveryDate,
          },
        });
      }
    });

    return {
      success: true,
      message: 'Offline customer restored to active list',
      customerId,
    };
  }

  /**
   * Placeholder identity written to purged rows. Must never collide with the
   * `offline.` prefix used by {@link offlineIdentity}, otherwise the archived
   * placeholder would itself look like an offline customer.
   */
  private static readonly PURGED_EMAIL = 'purged@offline.local';

  /**
   * Strips personal data from a JSON snapshot while preserving the non-personal
   * fields needed for reporting. Retained order and subscription snapshots hold
   * names, emails, phone numbers and full addresses, so anonymizing only the
   * live user row would leave the customer's PII in place.
   */
  private redactSnapshot(snapshot: unknown, kind: 'customer' | 'address'): unknown {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return snapshot;
    }
    const source = { ...(snapshot as Record<string, unknown>) };
    const piiKeys =
      kind === 'customer'
        ? ['name', 'email', 'phone', 'phoneE164', 'alternatePhoneE164']
        : ['recipientName', 'phoneE164', 'alternatePhoneE164', 'line1', 'line2', 'landmark', 'instructions'];
    for (const key of piiKeys) {
      if (key in source) source[key] = null;
    }
    return source;
  }

  async permanentDeleteCustomer(customerId: string, actor?: OfflineCustomerActor) {
    // Purge is destructive and irreversible: require an offline customer that
    // is owned by the actor, so an arbitrary id cannot be anonymized and
    // another store's customer cannot be destroyed.
    await this.loadOfflineCustomer(customerId, 'any', actor, true);

    if (actor && actor.role !== Role.ADMIN) {
      const otherStoreSubscription = await prisma.customerSubscription.findFirst({
        where: {
          customerId,
          homeStore: { ownerId: { not: actor.id } },
        },
        select: { id: true },
      });
      if (otherStoreSubscription) {
        throw new ForbiddenException('Cannot permanently delete customer because they have subscriptions at another store');
      }
      const otherStoreOrder = await prisma.order.findFirst({
        where: {
          customerId,
          store: { ownerId: { not: actor.id } },
        },
        select: { id: true },
      });
      if (otherStoreOrder) {
        throw new ForbiddenException('Cannot permanently delete customer because they have orders at another store');
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: customerId },
      include: {
        orders: { select: { id: true }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException('Customer not found');

    if (user.orders.length > 0) {
      // Orders are retained for financial records, so the customer row is
      // anonymized in place rather than deleted. Their snapshots must be
      // scrubbed too, in the same transaction, so the purge is complete.
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: customerId },
          data: {
            name: 'Purged Offline Customer',
            phone: null,
            email: OfflineCustomerService.PURGED_EMAIL,
            isActive: false,
            deactivatedAt: user.deactivatedAt ?? new Date(),
            deactivationReason: 'PERMANENTLY_PURGED',
          },
        });

        const orders = await tx.order.findMany({
          where: { customerId },
          select: { id: true, customerSnapshot: true, addressSnapshot: true },
        });
        for (const order of orders) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              customerSnapshot: this.redactSnapshot(order.customerSnapshot, 'customer') as Prisma.InputJsonValue,
              addressSnapshot: this.redactSnapshot(order.addressSnapshot, 'address') as Prisma.InputJsonValue,
            },
          });
        }

        const subscriptions = await tx.customerSubscription.findMany({
          where: { customerId },
          select: { id: true, addressSnapshot: true },
        });
        const subscriptionIds = subscriptions.map((s) => s.id);

        for (const subscription of subscriptions) {
          await tx.customerSubscription.update({
            where: { id: subscription.id },
            data: {
              addressSnapshot: this.redactSnapshot(subscription.addressSnapshot, 'address') as Prisma.InputJsonValue,
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancellationReason: 'PERMANENTLY_PURGED_CUSTOMER',
            },
          });
        }

        if (subscriptionIds.length > 0) {
          const pendingDeliveries = await tx.subscriptionDelivery.findMany({
            where: {
              subscriptionId: { in: subscriptionIds },
              status: { notIn: ['DELIVERED', 'FAILED', 'SKIPPED', 'CANCELLED'] },
            },
            select: { id: true, deliveryJobId: true },
          });
          const pendingDeliveryIds = pendingDeliveries.map((d) => d.id);
          const pendingJobIds = pendingDeliveries
            .map((d) => d.deliveryJobId)
            .filter((id): id is string => Boolean(id));

          if (pendingDeliveryIds.length > 0) {
            await tx.deliveryRunStop.deleteMany({
              where: {
                OR: [
                  { subscriptionDeliveryId: { in: pendingDeliveryIds } },
                  { deliveryJobId: { in: pendingJobIds } },
                ],
              },
            });
            await tx.subscriptionDelivery.updateMany({
              where: { id: { in: pendingDeliveryIds } },
              data: { status: 'CANCELLED' },
            });
          }

          // Cancel unfulfilled subscription-generated orders so they do not linger in dispatch
          await tx.order.updateMany({
            where: {
              customerId,
              subscriptionId: { in: subscriptionIds },
              status: { in: ['CONFIRMED', 'PENDING', 'PACKED'] },
            },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
            },
          });
        }

        await tx.customerAddress.deleteMany({ where: { userId: customerId } });
      });
      return {
        success: true,
        message: 'Offline customer permanently purged (historical orders safely archived).',
      };
    }

    // The whole purge runs in one transaction so a foreign-key failure cannot
    // leave earlier deletions committed and the customer only partially
    // removed. Restrict-linked dependents are removed before their parents:
    // transfers/proofs, then run stops, then deliveries, then subscriptions
    // (which pin the address), then addresses, then the user.
    await prisma.$transaction(async (tx) => {
      const subscriptions = await tx.customerSubscription.findMany({
        where: { customerId },
        select: { id: true },
      });
      const subscriptionIds = subscriptions.map((s) => s.id);

      if (subscriptionIds.length > 0) {
        const deliveries = await tx.subscriptionDelivery.findMany({
          where: { subscriptionId: { in: subscriptionIds } },
          select: { id: true, deliveryJobId: true },
        });
        const deliveryIds = deliveries.map((d) => d.id);
        const deliveryJobIds = deliveries
          .map((d) => d.deliveryJobId)
          .filter((id): id is string => Boolean(id));

        if (deliveryIds.length > 0) {
          await tx.riderPhotoProof.deleteMany({
            where: { subscriptionDeliveryId: { in: deliveryIds } },
          });
          await tx.storeDeliveryProof.deleteMany({
            where: { subscriptionDeliveryId: { in: deliveryIds } },
          });
        }

        if (deliveryJobIds.length > 0) {
          await tx.trustedDropEvidence.deleteMany({
            where: { deliveryJobId: { in: deliveryJobIds } },
          });
          await tx.riderPhotoProof.deleteMany({
            where: { deliveryJobId: { in: deliveryJobIds } },
          });
          await tx.storeDeliveryProof.deleteMany({
            where: { deliveryJobId: { in: deliveryJobIds } },
          });
          await tx.deliveryRunStop.deleteMany({
            where: { deliveryJobId: { in: deliveryJobIds } },
          });
        }

        // Drop any evidence still pointing at these deliveries, then the
        // challenges, so the delivery rows are no longer restricted.
        if (deliveryIds.length > 0) {
          await tx.trustedDropEvidence.deleteMany({
            where: { subscriptionDeliveryId: { in: deliveryIds } },
          });
        }
        await tx.trustedDropChallenge.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await tx.subscriptionFundingAllocation.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await tx.subscriptionIssueReport.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await tx.subscriptionAuditEntry.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await tx.subscriptionDelivery.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        // The subscription holds a Restrict reference to its address.
        await tx.customerSubscription.deleteMany({
          where: { id: { in: subscriptionIds } },
        });
      }

      await tx.customerAddress.deleteMany({ where: { userId: customerId } });
      await tx.user.delete({ where: { id: customerId } });
    });

    return {
      success: true,
      message: 'Offline customer permanently deleted.',
    };
  }
}
