import { prisma, Role } from '@aagam/database';
import { randomUUID } from 'crypto';

export type UserRoleQueryClient = {
  $queryRawUnsafe: (...args: any[]) => Promise<any[]>;
  $executeRawUnsafe: (...args: any[]) => Promise<any>;
};

export async function activeUserRoles(
  userId: string,
  primaryRole: Role,
  client: Pick<UserRoleQueryClient, '$queryRawUnsafe'> = prisma,
): Promise<Role[]> {
  const roles = new Set<Role>([primaryRole]);
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT "role" FROM "UserRoleMembership"
       WHERE "userId" = $1 AND "status" = 'ACTIVE'
       ORDER BY "grantedAt" ASC`,
      userId,
    );
    for (const row of rows) {
      if (Object.values(Role).includes(row.role)) roles.add(row.role as Role);
    }
  } catch {
    // During rolling deploys the application can start before the additive
    // migration is applied. The primary role remains a safe compatibility path.
  }
  return [...roles];
}

export async function grantUserRole(
  client: Pick<UserRoleQueryClient, '$executeRawUnsafe'>,
  userId: string,
  role: Role,
  source: string,
  grantedByUserId?: string | null,
) {
  await client.$executeRawUnsafe(
    `INSERT INTO "UserRoleMembership" (
       "id", "userId", "role", "status", "source", "grantedByUserId", "grantedAt", "revokedAt"
     ) VALUES ($1,$2,$3::"Role",'ACTIVE',$4,$5,CURRENT_TIMESTAMP,NULL)
     ON CONFLICT ("userId", "role") DO UPDATE SET
       "status" = 'ACTIVE', "source" = EXCLUDED."source",
       "grantedByUserId" = EXCLUDED."grantedByUserId",
       "grantedAt" = CURRENT_TIMESTAMP, "revokedAt" = NULL`,
    randomUUID(),
    userId,
    role,
    source.slice(0, 80),
    grantedByUserId || null,
  );
}

export function hasUserRole(user: { role?: Role; roles?: Role[] }, role: Role) {
  return user.role === role || user.roles?.includes(role) === true;
}
