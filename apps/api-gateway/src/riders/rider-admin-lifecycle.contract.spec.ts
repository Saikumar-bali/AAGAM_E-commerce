import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, 'rider.service.ts'), 'utf8');

describe('Rider admin identity lifecycle contract', () => {
  it('returns explicit conflicts instead of leaking unique-constraint failures', () => {
    expect(source).toContain('normalizeEmail(data.email)');
    expect(source).toContain('normalizePhoneE164(data.phone)');
    expect(source).toContain("code?: string })?.code === 'P2002'");
    expect(source).toContain('An account already uses this phone number');
    expect(source).toContain('An account already uses this email address');
  });

  it('removes Rider access without deleting FK-anchored User or RiderProfile rows', () => {
    expect(source).not.toContain('tx.user.delete(');
    expect(source).not.toContain('prisma.user.delete(');
    expect(source).not.toContain('tx.riderProfile.delete(');
    expect(source).not.toContain('prisma.riderProfile.delete(');
    expect(source).toContain('Rider access removed successfully');
    expect(source).toContain("SET \"status\" = 'REVOKED', \"revokedAt\" = CURRENT_TIMESTAMP");
    expect(source).toContain("data: { status: 'OFFLINE' }");
  });

  it('preserves legitimate legacy Store/Customer identities when Rider is removed', () => {
    expect(source).toContain('where: { ownerId: userId }');
    expect(source).toContain('fallbackRole = Role.STORE_OWNER');
    expect(source).toContain('where: { customerId: userId }');
    expect(source).toContain('fallbackRole = Role.CUSTOMER');
  });
});
