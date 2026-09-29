/**
 * Promotions service facade.
 *
 * Split out of the former promotions.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Injectable } from '@nestjs/common';
import { PromotionPlacement, prisma } from '@aagam/database';
import { UpsertCouponDto, UpsertPromotionCampaignDto } from './promotions.dto';
import { PromotionsServiceBase } from './promotions.service.base';
import { DbClient, PricingLine } from './promotions.shared';
import { PromotionCampaignService } from './promotions.campaign.service';
import { PromotionCouponService } from './promotions.coupon.service';
import { PromotionPricingService } from './promotions.pricing.service';

@Injectable()
export class PromotionsService extends PromotionsServiceBase {
  private readonly campaign: PromotionCampaignService;
  private readonly coupon: PromotionCouponService;
  private readonly pricing: PromotionPricingService;

  constructor() {
    super();
    this.campaign = new PromotionCampaignService();
    this.coupon = new PromotionCouponService();
    this.pricing = new PromotionPricingService();
  }

  async calculateDiscount(
    input: {
      userId: string;
      couponCode?: string | null;
      storeId: string;
      subtotalPaise: number;
      deliveryFeePaise: number;
      lines: PricingLine[];
    },
    db: DbClient = prisma
  ) {
    return this.pricing.calculateDiscount(input, db);
  }

  async activeCampaigns(userId: string | undefined, placement?: PromotionPlacement) {
    return this.campaign.activeCampaigns(userId, placement);
  }

  async adminCampaigns() {
    return this.campaign.adminCampaigns();
  }

  async createCampaign(adminUserId: string, dto: UpsertPromotionCampaignDto) {
    return this.campaign.createCampaign(adminUserId, dto);
  }

  async updateCampaign(id: string, dto: UpsertPromotionCampaignDto) {
    return this.campaign.updateCampaign(id, dto);
  }

  async archiveCampaign(id: string) {
    return this.campaign.archiveCampaign(id);
  }

  async createCoupon(adminUserId: string, dto: UpsertCouponDto) {
    return this.coupon.createCoupon(adminUserId, dto);
  }

  async updateCoupon(id: string, dto: UpsertCouponDto) {
    return this.coupon.updateCoupon(id, dto);
  }

  async archiveCoupon(id: string) {
    return this.coupon.archiveCoupon(id);
  }

  async deals(userId: string) {
    const [campaigns, coupons] = await Promise.all([
      this.campaign.activeCampaigns(userId, PromotionPlacement.DEALS_PAGE),
      this.pricing.publicCoupons(userId),
    ]);
    return {
      serverTime: campaigns.serverTime,
      campaigns: campaigns.placements.DEALS_PAGE,
      coupons,
    };
  }
}
