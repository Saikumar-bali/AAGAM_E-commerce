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
  coupon?: {
    code?: string | null;
    name: string;
    discountType: string;
    applicationMode: string;
  } | null;
};

export type PromotionPlacements = {
  HOME_HERO: PromotionCampaign[];
  HOME_TODAY_OFFERS: PromotionCampaign[];
  DEALS_PAGE: PromotionCampaign[];
};
