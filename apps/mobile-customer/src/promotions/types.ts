export type PromotionCampaign = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badgeText?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  ctaLabel: string;
  targetUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type PromotionPlacements = {
  HOME_HERO: PromotionCampaign[];
  HOME_TODAY_OFFERS: PromotionCampaign[];
  DEALS_PAGE: PromotionCampaign[];
};

export type PublicCoupon = {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  applicationMode: 'CODE' | 'AUTO';
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_DELIVERY';
  percentageBps?: number | null;
  amountPaise?: number | null;
  maxDiscountPaise?: number | null;
  minimumSubtotalPaise: number;
  firstOrderOnly: boolean;
  eligibilityScope: string;
  startsAt?: string | null;
  endsAt?: string | null;
  store?: { id: string; name: string } | null;
  eligible: boolean;
  ineligibleReason?: string | null;
};

export const emptyPromotionPlacements = (): PromotionPlacements => ({
  HOME_HERO: [],
  HOME_TODAY_OFFERS: [],
  DEALS_PAGE: [],
});

export const normalizePromotionPlacements = (value: unknown): PromotionPlacements => {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const nested = root.placements && typeof root.placements === 'object'
    ? root.placements
    : root;
  const placements = nested && typeof nested === 'object'
    ? nested as Partial<PromotionPlacements>
    : {};
  return {
    HOME_HERO: Array.isArray(placements.HOME_HERO) ? placements.HOME_HERO : [],
    HOME_TODAY_OFFERS: Array.isArray(placements.HOME_TODAY_OFFERS)
      ? placements.HOME_TODAY_OFFERS
      : [],
    DEALS_PAGE: Array.isArray(placements.DEALS_PAGE) ? placements.DEALS_PAGE : [],
  };
};

export const couponLabel = (coupon: PublicCoupon) => {
  if (coupon.discountType === 'FREE_DELIVERY') return 'Free delivery';
  if (coupon.discountType === 'FIXED_AMOUNT') {
    return `₹${Math.round(Number(coupon.amountPaise || 0) / 100)} off`;
  }
  return `${Number(coupon.percentageBps || 0) / 100}% off`;
};
