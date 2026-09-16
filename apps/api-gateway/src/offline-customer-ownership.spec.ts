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
