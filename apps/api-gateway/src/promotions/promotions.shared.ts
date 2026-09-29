/**
 * Shared promotion types, constants and query includes.
 *
 * Split out of the former promotions.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Prisma, prisma } from '@aagam/database';

export type DbClient = Prisma.TransactionClient | typeof prisma;
export type PricingLine = {
  productId: string;
  categoryId: string;
  lineTotalPaise: number;
};

export const couponInclude = {
  store: { select: { id: true, name: true } },
  productEligibilities: { select: { productId: true } },
  categoryEligibilities: { select: { categoryId: true } },
  _count: { select: { redemptions: true, promotionCampaigns: true } },
} satisfies Prisma.CouponInclude;

export const campaignInclude = {
  placements: { orderBy: { sortOrder: "asc" as const } },
  product: { select: { id: true, name: true, image: true } },
  category: { select: { id: true, name: true } },
  coupon: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      discountType: true,
      applicationMode: true,
      startsAt: true,
      endsAt: true,
    },
  },
} satisfies Prisma.PromotionCampaignInclude;
