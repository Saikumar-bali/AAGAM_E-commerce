/**
 * Permanent delete and anonymisation.
 *
 * Split out of the former offline-customer.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';
import { OfflineCustomerService } from './offline-customer.service';
import { OfflineCustomerServiceBase, OfflineCustomerActor } from './offline-customer.service.base';

export class OfflineCustomerPurgeService extends OfflineCustomerServiceBase {
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
}
