export const PUBLIC_PROMOTION_PLACEMENTS = [
  'HOME_HERO',
  'HOME_TODAY_OFFERS',
  'DEALS_PAGE',
  'LANDING_HERO',
  'LANDING_BANNER',
  'LOGIN_SIDEBAR',
] as const;

export type PublicPromotionPlacement = (typeof PUBLIC_PROMOTION_PLACEMENTS)[number];

export type PublicPromotionCampaign = {
  id?: string;
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  badgeText?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  accentColor?: string | null;
  ctaLabel?: string | null;
  targetType?: string | null;
  targetUrl?: string | null;
  priority?: number;
};

export type PublicPromotionPlacements = Record<
  PublicPromotionPlacement,
  PublicPromotionCampaign[]
>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emptyPlacements(): PublicPromotionPlacements {
  return PUBLIC_PROMOTION_PLACEMENTS.reduce((placements, placement) => {
    placements[placement] = [];
    return placements;
  }, {} as PublicPromotionPlacements);
}

/**
 * Normalizes the public promotions API response without changing its contract.
 * The current API wraps campaigns in `placements`; the direct placement map is
 * retained only for clients still receiving the legacy response shape.
 */
export function normalizePromotionPlacements(payload: unknown): PublicPromotionPlacements {
  const normalized = emptyPlacements();
  if (!isRecord(payload)) return normalized;

  const source = Object.prototype.hasOwnProperty.call(payload, 'placements')
    ? (isRecord(payload.placements) ? payload.placements : null)
    : payload;

  if (!source) return normalized;

  for (const placement of PUBLIC_PROMOTION_PLACEMENTS) {
    const campaigns = source[placement];
    if (!Array.isArray(campaigns)) continue;
    normalized[placement] = campaigns.filter(isRecord) as PublicPromotionCampaign[];
  }

  return normalized;
}
