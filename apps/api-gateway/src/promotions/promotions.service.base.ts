/**
 * Shared promotion helpers and admin coupon listing.
 *
 * Split out of the former promotions.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException } from '@nestjs/common';
import { PromotionStatus, PromotionTargetType, prisma } from '@aagam/database';
import { couponInclude } from './promotions.shared';

export class PromotionsServiceBase {
  protected requireText(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  protected date(value?: string | Date | null) {
    return value ? new Date(value) : null;
  }

  protected validateSchedule(
    startsAt?: string | Date | null,
    endsAt?: string | Date | null
  ) {
    const start = this.date(startsAt);
    const end = this.date(endsAt);
    if (start && Number.isNaN(start.getTime()))
      throw new BadRequestException("Invalid campaign start time");
    if (end && Number.isNaN(end.getTime()))
      throw new BadRequestException("Invalid campaign end time");
    if (start && end && end <= start)
      throw new BadRequestException("End time must be after start time");
  }

  protected effectiveStatus(
    status: string,
    startsAt?: Date | null,
    endsAt?: Date | null
  ) {
    const now = Date.now();
    if (status === PromotionStatus.ARCHIVED) return "ARCHIVED";
    if (status === PromotionStatus.PAUSED) return "PAUSED";
    if (status === PromotionStatus.DRAFT) return "DRAFT";
    if (startsAt && startsAt.getTime() > now) return "SCHEDULED";
    if (endsAt && endsAt.getTime() <= now) return "EXPIRED";
    return "ACTIVE";
  }

  protected campaignTargetUrl(campaign: any) {
    if (
      campaign.targetType === PromotionTargetType.PRODUCT &&
      campaign.productId
    )
      return `/shop/products/${campaign.productId}`;
    if (
      campaign.targetType === PromotionTargetType.CATEGORY &&
      campaign.categoryId
    )
      return `/shop?category=${encodeURIComponent(campaign.categoryId)}`;
    if (campaign.targetType === PromotionTargetType.DEALS) return "/shop/deals";
    if (
      campaign.targetType === PromotionTargetType.INTERNAL_PATH &&
      campaign.targetPath
    )
      return campaign.targetPath;
    return null;
  }

  protected validateInternalPath(path?: string | null) {
    if (!path || !/^\/shop(?:[/?#]|$)/.test(path) || path.startsWith("//")) {
      throw new BadRequestException(
        "Campaign paths must be internal /shop routes"
      );
    }
  }

  async adminCoupons() {
    const coupons = await prisma.coupon.findMany({
      include: couponInclude,
      orderBy: [{ updatedAt: "desc" }],
    });
    return coupons.map((coupon) => ({
      ...coupon,
      effectiveStatus: this.effectiveStatus(
        coupon.status,
        coupon.startsAt,
        coupon.endsAt
      ),
    }));
  }
}
