import { ForbiddenException } from '@nestjs/common';
import { Role } from '@aagam/database';
import { OfflineCustomerService } from './subscriptions/offline-customer.service';

/**
 * Exercises the real ownership predicates the lifecycle methods rely on. These
 * are pure (no Prisma access), so they can be asserted directly.
 */
describe('OfflineCustomerService ownership predicates', () => {
  const service = new OfflineCustomerService();
  const filter = (actor: { id: string; role: Role } | undefined, mutation = false) =>
    mutation
      ? (service as any).mutationOwnershipFilter(actor)
      : (service as any).ownershipFilter(actor);

  const storeOwner = { id: 'store-1', role: Role.STORE_OWNER };

  test('an admin read is unscoped', () => {
    expect(filter({ id: 'admin-1', role: Role.ADMIN })).toEqual({});
  });

  test('a store owner read is scoped to the stores they own', () => {
    expect(filter(storeOwner)).toEqual({
      OR: [
        { customerSubscriptions: { some: { homeStore: { ownerId: 'store-1' } } } },
        { offlineStore: { ownerId: 'store-1' } },
      ],
    });
  });

  test('an unrelated role cannot read offline customers', () => {
    expect(() => filter({ id: 'rider-1', role: Role.RIDER })).toThrow(ForbiddenException);
  });

  test('mutations reject admins even though reads allow them', () => {
    expect(() => filter({ id: 'admin-1', role: Role.ADMIN }, true)).toThrow(ForbiddenException);
  });

  test('mutations require an identified store owner', () => {
    expect(() => filter(undefined, true)).toThrow(ForbiddenException);
    expect(filter(storeOwner, true)).toEqual(filter(storeOwner));
  });
});

/**
 * Purge cannot delete an address a retained (cancelled) subscription still
 * points at: the CustomerSubscription.addressId FK is `onDelete: Restrict`, so
 * `deleteMany` threw a foreign-key violation and the whole purge 500'd.
 */
describe('OfflineCustomerService.scrubRetainedAddresses', () => {
  const service = new OfflineCustomerService();

  test('scrubs a retained address in place and deletes only unreferenced ones', async () => {
    const tx = {
      customerAddress: {
        findMany: jest.fn().mockResolvedValue([{ id: 'addr-kept' }, { id: 'addr-free' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customerSubscription: {
        findMany: jest.fn().mockResolvedValue([{ addressId: 'addr-kept' }]),
      },
    };

    await (service as any).scrubRetainedAddresses(tx, 'cust-1');

    expect(tx.customerAddress.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['addr-kept'] } } }),
    );
    const scrubData = tx.customerAddress.updateMany.mock.calls[0][0].data;
    expect(scrubData.recipientName).toBe('Purged Offline Customer');
    expect(scrubData.phoneE164).toBe('0000000000');
    expect(scrubData.line1).toBe('Purged');
    expect(scrubData.city).toBe('');
    expect(scrubData.pincode).toBe('');
    expect(tx.customerAddress.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['addr-free'] } } });
  });

  test('deletes every address when none are retained', async () => {
    const tx = {
      customerAddress: {
        findMany: jest.fn().mockResolvedValue([{ id: 'addr-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customerSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await (service as any).scrubRetainedAddresses(tx, 'cust-1');

    expect(tx.customerAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.customerAddress.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['addr-1'] } } });
  });

  test('does nothing when the customer has no addresses', async () => {
    const tx = {
      customerAddress: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      customerSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await (service as any).scrubRetainedAddresses(tx, 'cust-1');

    expect(tx.customerAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.customerAddress.deleteMany).not.toHaveBeenCalled();
  });
});
