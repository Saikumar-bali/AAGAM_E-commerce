import { Role } from '@aagam/database';
import { activeUserRoles, grantUserRole, hasUserRole } from './user-roles';

describe('multi-role identity helpers', () => {
  it('keeps the primary role and adds every active membership exactly once', async () => {
    const client = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        { role: Role.CUSTOMER },
        { role: Role.RIDER },
        { role: Role.RIDER },
      ]),
    };

    await expect(activeUserRoles('user-1', Role.CUSTOMER, client as any)).resolves.toEqual([
      Role.CUSTOMER,
      Role.RIDER,
    ]);
  });

  it('falls back safely to the legacy primary role during a rolling migration', async () => {
    const client = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('table not migrated yet')),
    };

    await expect(activeUserRoles('user-1', Role.STORE_OWNER, client as any)).resolves.toEqual([
      Role.STORE_OWNER,
    ]);
  });

  it('upserts an active audited membership instead of replacing another role', async () => {
    const client = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };

    await grantUserRole(client as any, 'customer-1', Role.RIDER, 'PARTNER_APPROVAL', 'admin-1');

    expect(client.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, , userId, role, source, adminId] = client.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('ON CONFLICT ("userId", "role") DO UPDATE');
    expect(userId).toBe('customer-1');
    expect(role).toBe(Role.RIDER);
    expect(source).toBe('PARTNER_APPROVAL');
    expect(adminId).toBe('admin-1');
  });

  it('authorizes against either the primary role or an added membership', () => {
    const user = { role: Role.CUSTOMER, roles: [Role.CUSTOMER, Role.RIDER] };
    expect(hasUserRole(user, Role.CUSTOMER)).toBe(true);
    expect(hasUserRole(user, Role.RIDER)).toBe(true);
    expect(hasUserRole(user, Role.ADMIN)).toBe(false);
  });
});
