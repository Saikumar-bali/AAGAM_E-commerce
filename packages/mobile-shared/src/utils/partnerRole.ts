export type PartnerOperationalRole = 'ADMIN' | 'RIDER' | 'STORE_OWNER';

type RoleLike = string | { role?: unknown; name?: unknown; code?: unknown } | null | undefined;

type PartnerUserLike = {
  id?: unknown;
  role?: RoleLike;
  roles?: unknown;
} | null | undefined;

const ROLE_PRECEDENCE: readonly PartnerOperationalRole[] = [
  'ADMIN',
  'RIDER',
  'STORE_OWNER',
];

function normalizeRole(value: RoleLike): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized || null;
  }
  if (!value || typeof value !== 'object') return null;
  return normalizeRole(
    (value.role ?? value.name ?? value.code) as RoleLike,
  );
}

export function collectPartnerRoles(user: PartnerUserLike): ReadonlySet<string> {
  const roles = new Set<string>();
  const primary = normalizeRole(user?.role);
  if (primary) roles.add(primary);

  if (Array.isArray(user?.roles)) {
    user.roles.forEach((entry) => {
      const role = normalizeRole(entry as RoleLike);
      if (role) roles.add(role);
    });
  }

  return roles;
}

/**
 * Resolves the one operational workspace that owns navigation, push routing,
 * device registration and role-scoped caches for the current partner session.
 *
 * Precedence is intentionally deterministic: ADMIN, RIDER, STORE_OWNER.
 * Backend 401/403 responses remain the final authorization authority.
 */
export function resolvePartnerOperationalRole(
  user: PartnerUserLike,
): PartnerOperationalRole | null {
  const roles = collectPartnerRoles(user);
  return ROLE_PRECEDENCE.find((role) => roles.has(role)) ?? null;
}

export function partnerOperationalSessionKey(user: PartnerUserLike): string {
  const id = typeof user?.id === 'string' && user.id.trim()
    ? user.id.trim()
    : 'anonymous';
  return `${id}:${resolvePartnerOperationalRole(user) ?? 'BLOCKED'}`;
}
