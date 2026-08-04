import {
  collectPartnerRoles,
  partnerOperationalSessionKey,
  resolvePartnerOperationalRole,
} from './partnerRole';

describe('resolvePartnerOperationalRole', () => {
  it.each([
    [{ role: 'RIDER' }, 'RIDER'],
    [{ role: 'CUSTOMER', roles: ['RIDER'] }, 'RIDER'],
    [{ role: 'CUSTOMER', roles: [{ name: 'STORE_OWNER' }] }, 'STORE_OWNER'],
    [{ role: 'STORE_OWNER', roles: ['RIDER'] }, 'RIDER'],
    [{ role: 'RIDER', roles: ['ADMIN'] }, 'ADMIN'],
  ])('resolves %p as %s', (user, expected) => {
    expect(resolvePartnerOperationalRole(user)).toBe(expected);
  });

  it('defensively ignores malformed roles', () => {
    const user = { id: 'u-1', role: 42 as any, roles: [null, {}, 5, ''] };
    expect(Array.from(collectPartnerRoles(user))).toEqual([]);
    expect(resolvePartnerOperationalRole(user)).toBeNull();
    expect(partnerOperationalSessionKey(user)).toBe('u-1:BLOCKED');
  });
});
