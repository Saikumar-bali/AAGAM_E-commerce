/**
 * Recycle-bin move and restore.
 *
 * Split out of the former offline-customer.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ForbiddenException } from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';
import { startOfUtcDay } from './subscription-calendar.service';
import { OfflineCustomerService } from './offline-customer.service';
import { OfflineCustomerServiceBase, OfflineCustomerActor } from './offline-customer.service.base';

export class OfflineCustomerLifecycleService extends OfflineCustomerServiceBase {
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
}
