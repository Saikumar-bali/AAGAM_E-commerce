import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(
  path.join(root, 'apps/api-gateway/src/riders/rider.service.ts'),
  'utf8',
);

describe('Rider status serialization contract', () => {
  it('uses the same user-based advisory lock for admin updates and heartbeats', () => {
    const identityLookup = source.indexOf(
      'const identity = await prisma.riderProfile.findUnique({',
    );
    const adminTransaction = source.indexOf(
      'const result = await prisma.$transaction(',
      identityLookup,
    );
    const adminLock = source.indexOf(
      'await this.lockStatus(tx, identity.userId);',
      adminTransaction,
    );
    const selfStatusMethod = source.indexOf(
      'async updateStatusForUser(userId: string',
    );
    const heartbeatLock = source.indexOf(
      'await this.lockStatus(tx, userId);',
      selfStatusMethod,
    );

    expect(identityLookup).toBeGreaterThan(-1);
    expect(adminTransaction).toBeGreaterThan(identityLookup);
    expect(adminLock).toBeGreaterThan(adminTransaction);
    expect(heartbeatLock).toBeGreaterThan(selfStatusMethod);
    expect(source).toContain('rider-status:user:${riderUserId}');
    expect(source).not.toContain('this.lockStatus(tx, `profile:${id}`)');
    expect(source).not.toContain('this.lockStatus(tx, `user:${userId}`)');
  });

  it('acquires each advisory lock before the first transactional Rider read', () => {
    const adminLock = source.indexOf(
      'await this.lockStatus(tx, identity.userId);',
    );
    const adminRead = source.indexOf(
      'const rider = await tx.riderProfile.findUnique({ where: { id } });',
      adminLock,
    );
    const selfMethod = source.indexOf(
      'async updateStatusForUser(userId: string',
    );
    const heartbeatLock = source.indexOf(
      'await this.lockStatus(tx, userId);',
      selfMethod,
    );
    const heartbeatRead = source.indexOf(
      'const existing = await tx.riderProfile.findUnique({ where: { userId } });',
      heartbeatLock,
    );

    expect(adminRead).toBeGreaterThan(adminLock);
    expect(heartbeatRead).toBeGreaterThan(heartbeatLock);
  });
});
