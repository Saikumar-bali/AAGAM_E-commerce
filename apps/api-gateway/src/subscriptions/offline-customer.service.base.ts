/**
 * Shared offline-customer identity, lifecycle and ownership predicates.
 *
 * Split out of the former offline-customer.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';

export type OfflineCustomerActor = { id: string; role: Role };

export class OfflineCustomerServiceBase {
  protected readonly offlineIdentity: Prisma.UserWhereInput = {
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
              { isCustom: true },
              { storeDelivery: true },
            ],
          },
        },
      },
    ],
  };

  protected readonly recycleBinState: Prisma.UserWhereInput = {
    OR: [{ isActive: false }, { deactivatedAt: { not: null } }],
    // A purged customer is anonymized rather than deleted when historical
    // orders must be retained. It is archived for financial records and must
    // not resurface as a restorable recycle-bin entry.
    NOT: { deactivationReason: 'PERMANENTLY_PURGED' },
  };

  protected readonly activeState: Prisma.UserWhereInput = {
    isActive: true,
    deactivatedAt: null,
  };

  protected ownershipFilter(actor?: OfflineCustomerActor): Prisma.UserWhereInput {
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

  protected mutationOwnershipFilter(actor?: OfflineCustomerActor): Prisma.UserWhereInput {
    if (!actor || actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException('Only the store that owns the customer can delete or restore it');
    }
    return this.ownershipFilter(actor);
  }

  protected async loadOfflineCustomer(
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
    const identityFilter = this.offlineIdentity;
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
}
