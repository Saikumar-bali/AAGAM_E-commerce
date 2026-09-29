/**
 * Campaign authoring, listing and public feeds.
 *
 * Split out of the former promotions.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponApplicationMode, CouponStatus, PromotionPlacement, PromotionStatus, PromotionTargetType, prisma } from '@aagam/database';
import { UpsertPromotionCampaignDto } from './promotions.dto';
import { resolveCampaignStatus } from './promotion-scheduling';
import { PromotionsServiceBase } from './promotions.service.base';
import { campaignInclude } from './promotions.shared';

@Injectable()
export class PromotionCampaignService extends PromotionsServiceBase {
  protected async validateCampaignTarget(input: {
    targetType: PromotionTargetType;
    targetPath?: string | null;
    productId?: string | null;
    categoryId?: string | null;
    couponId?: string | null;
  }) {
    if (input.targetType === PromotionTargetType.PRODUCT) {
      if (!input.productId)
        throw new BadRequestException("A product target is required");
      const product = await prisma.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true },
      });
      if (!product)
        throw new BadRequestException("Target product does not exist");
    }
    if (input.targetType === PromotionTargetType.CATEGORY) {
      if (!input.categoryId)
        throw new BadRequestException("A category target is required");
      const category = await prisma.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      });
      if (!category)
        throw new BadRequestException("Target category does not exist");
    }
    if (input.targetType === PromotionTargetType.INTERNAL_PATH)
      this.validateInternalPath(input.targetPath);
    if (input.couponId) {
      const coupon = await prisma.coupon.findFirst({
        where: { id: input.couponId, status: { not: CouponStatus.ARCHIVED } },
        select: { id: true },
      });
      if (!coupon)
        throw new BadRequestException(
          "Linked coupon does not exist or is archived"
        );
    }
  }

  protected assertPublishableSchedule(
    status: PromotionStatus,
    endsAt?: string | Date | null,
  ) {
    if (
      (status === PromotionStatus.ACTIVE ||
        status === PromotionStatus.SCHEDULED) &&
      endsAt
    ) {
      const end = this.date(endsAt);
      if (end && end.getTime() <= Date.now()) {
        throw new BadRequestException(
          "Published campaigns must have an end time in the future",
        );
      }
    }
  }

  protected publicCampaign(campaign: any) {
    const now = new Date();
    const couponIsLive =
      campaign.coupon &&
      [CouponStatus.ACTIVE, CouponStatus.SCHEDULED].includes(
        campaign.coupon.status
      ) &&
      (!campaign.coupon.startsAt || campaign.coupon.startsAt <= now) &&
      (!campaign.coupon.endsAt || campaign.coupon.endsAt > now);
    return {
      id: campaign.id,
      title: campaign.title,
      subtitle: campaign.subtitle,
      description: campaign.description,
      badgeText: campaign.badgeText,
      imageUrl: campaign.imageUrl,
      mobileImageUrl: campaign.mobileImageUrl,
      backgroundColor: campaign.backgroundColor,
      textColor: campaign.textColor,
      accentColor: campaign.accentColor,
      ctaLabel: campaign.ctaLabel,
      targetType: campaign.targetType,
      targetUrl: this.campaignTargetUrl(campaign),
      priority: campaign.priority,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      placements: campaign.placements.map((row: any) => row.placement),
      coupon: couponIsLive
        ? {
            code:
              campaign.coupon.applicationMode === CouponApplicationMode.CODE
                ? campaign.coupon.code
                : null,
            name: campaign.coupon.name,
            discountType: campaign.coupon.discountType,
            applicationMode: campaign.coupon.applicationMode,
          }
        : null,
    };
  }

  async activeCampaigns(userId: string | undefined, placement?: PromotionPlacement) {
    const now = new Date();
    const hasPriorOrder = userId
      ? await prisma.order.count({
          where: {
            customerId: userId,
            status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] },
          },
        })
      : 0;
    const campaigns = await prisma.promotionCampaign.findMany({
      where: {
        status: { in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
        ...(hasPriorOrder > 0 ? { firstOrderOnly: false } : {}),
        ...(placement ? { placements: { some: { placement } } } : {}),
      },
      include: campaignInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    const result: Record<string, any[]> = {
      HOME_HERO: [],
      HOME_TODAY_OFFERS: [],
      DEALS_PAGE: [],
      LANDING_HERO: [],
      LANDING_BANNER: [],
      LOGIN_SIDEBAR: [],
    };
    for (const campaign of campaigns) {
      const publicRow = this.publicCampaign(campaign);
      for (const assignment of campaign.placements) {
        if (!placement || assignment.placement === placement)
          result[assignment.placement].push(publicRow);
      }
    }
    return { serverTime: now.toISOString(), placements: result };
  }

  async adminCampaigns() {
    const campaigns = await prisma.promotionCampaign.findMany({
      include: campaignInclude,
      orderBy: [{ updatedAt: "desc" }],
    });
    return campaigns.map((campaign) => ({
      ...campaign,
      effectiveStatus: this.effectiveStatus(
        campaign.status,
        campaign.startsAt,
        campaign.endsAt
      ),
      targetUrl: this.campaignTargetUrl(campaign),
    }));
  }

  async createCampaign(adminUserId: string, dto: UpsertPromotionCampaignDto) {
    const internalName = this.requireText(dto.internalName, "Internal name");
    const title = this.requireText(dto.title, "Title");
    if (!dto.placements?.length)
      throw new BadRequestException("Select at least one placement");
    const targetType = dto.targetType ?? PromotionTargetType.DEALS;
    this.validateSchedule(dto.startsAt, dto.endsAt);
    await this.validateCampaignTarget({ ...dto, targetType });
    const status = resolveCampaignStatus(dto.status, dto.startsAt);
    this.assertPublishableSchedule(status, dto.endsAt);
    const now = new Date();
    return prisma.promotionCampaign.create({
      data: {
        internalName,
        title,
        subtitle: dto.subtitle?.trim() || null,
        description: dto.description?.trim() || null,
        badgeText: dto.badgeText?.trim() || null,
        imageUrl: dto.imageUrl || null,
        mobileImageUrl: dto.mobileImageUrl || null,
        backgroundColor: dto.backgroundColor || "#0f172a",
        textColor: dto.textColor || "#ffffff",
        accentColor: dto.accentColor || "#14b8a6",
        ctaLabel: dto.ctaLabel?.trim() || "Shop now",
        targetType,
        targetPath:
          targetType === PromotionTargetType.INTERNAL_PATH
            ? dto.targetPath
            : null,
        productId:
          targetType === PromotionTargetType.PRODUCT ? dto.productId : null,
        categoryId:
          targetType === PromotionTargetType.CATEGORY ? dto.categoryId : null,
        couponId: dto.couponId || null,
        status,
        startsAt: this.date(dto.startsAt),
        endsAt: this.date(dto.endsAt),
        priority: dto.priority ?? 0,
        firstOrderOnly: dto.firstOrderOnly ?? false,
        createdByUserId: adminUserId,
        publishedAt:
          status === PromotionStatus.ACTIVE ||
          status === PromotionStatus.SCHEDULED
            ? now
            : null,
        placements: {
          create: dto.placements.map((placement) => ({
            placement,
            sortOrder: -(dto.priority ?? 0),
          })),
        },
      },
      include: campaignInclude,
    });
  }

  async updateCampaign(id: string, dto: UpsertPromotionCampaignDto) {
    const current = await prisma.promotionCampaign.findUnique({
      where: { id },
      include: { placements: true },
    });
    if (!current) throw new NotFoundException("Campaign not found");
    const targetType = dto.targetType ?? current.targetType;
    const merged = {
      targetType,
      targetPath:
        dto.targetPath !== undefined ? dto.targetPath : current.targetPath,
      productId:
        dto.productId !== undefined ? dto.productId : current.productId,
      categoryId:
        dto.categoryId !== undefined ? dto.categoryId : current.categoryId,
      couponId: dto.couponId !== undefined ? dto.couponId : current.couponId,
    };
    this.validateSchedule(
      dto.startsAt ?? current.startsAt,
      dto.endsAt ?? current.endsAt
    );
    await this.validateCampaignTarget(merged);
    const requestedStatus = dto.status ?? current.status;
    const status =
      dto.status !== undefined || dto.startsAt !== undefined
        ? resolveCampaignStatus(
            requestedStatus,
            dto.startsAt !== undefined ? dto.startsAt : current.startsAt,
          )
        : current.status;
    if (
      dto.status !== undefined ||
      dto.startsAt !== undefined ||
      dto.endsAt !== undefined
    ) {
      this.assertPublishableSchedule(
        status,
        dto.endsAt !== undefined ? dto.endsAt : current.endsAt,
      );
    }
    return prisma.$transaction(async (tx) => {
      if (dto.placements) {
        if (!dto.placements.length)
          throw new BadRequestException("Select at least one placement");
        await tx.promotionPlacementAssignment.deleteMany({
          where: { campaignId: id },
        });
        await tx.promotionPlacementAssignment.createMany({
          data: dto.placements.map((placement) => ({
            campaignId: id,
            placement,
            sortOrder: -(dto.priority ?? current.priority),
          })),
        });
      }
      return tx.promotionCampaign.update({
        where: { id },
        data: {
          ...(dto.internalName !== undefined
            ? {
                internalName: this.requireText(
                  dto.internalName,
                  "Internal name"
                ),
              }
            : {}),
          ...(dto.title !== undefined
            ? { title: this.requireText(dto.title, "Title") }
            : {}),
          ...(dto.subtitle !== undefined
            ? { subtitle: dto.subtitle?.trim() || null }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.badgeText !== undefined
            ? { badgeText: dto.badgeText?.trim() || null }
            : {}),
          ...(dto.imageUrl !== undefined
            ? { imageUrl: dto.imageUrl || null }
            : {}),
          ...(dto.mobileImageUrl !== undefined
            ? { mobileImageUrl: dto.mobileImageUrl || null }
            : {}),
          ...(dto.backgroundColor !== undefined
            ? { backgroundColor: dto.backgroundColor }
            : {}),
          ...(dto.textColor !== undefined ? { textColor: dto.textColor } : {}),
          ...(dto.accentColor !== undefined
            ? { accentColor: dto.accentColor }
            : {}),
          ...(dto.ctaLabel !== undefined
            ? { ctaLabel: dto.ctaLabel.trim() || "Shop now" }
            : {}),
          targetType,
          targetPath:
            targetType === PromotionTargetType.INTERNAL_PATH
              ? merged.targetPath
              : null,
          productId:
            targetType === PromotionTargetType.PRODUCT
              ? merged.productId
              : null,
          categoryId:
            targetType === PromotionTargetType.CATEGORY
              ? merged.categoryId
              : null,
          ...(dto.couponId !== undefined
            ? { couponId: dto.couponId || null }
            : {}),
          status,
          ...(dto.startsAt !== undefined
            ? { startsAt: this.date(dto.startsAt) }
            : {}),
          ...(dto.endsAt !== undefined
            ? { endsAt: this.date(dto.endsAt) }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.firstOrderOnly !== undefined
            ? { firstOrderOnly: dto.firstOrderOnly }
            : {}),
          ...((status === PromotionStatus.ACTIVE ||
            status === PromotionStatus.SCHEDULED) &&
          !current.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        },
        include: campaignInclude,
      });
    });
  }

  async archiveCampaign(id: string) {
    const exists = await prisma.promotionCampaign.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Campaign not found");
    return prisma.promotionCampaign.update({
      where: { id },
      data: { status: PromotionStatus.ARCHIVED },
    });
  }
}
