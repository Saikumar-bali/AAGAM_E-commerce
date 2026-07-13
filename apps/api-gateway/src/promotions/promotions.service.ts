import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CouponApplicationMode,
  CouponDiscountType,
  CouponEligibilityScope,
  CouponRedemptionStatus,
  CouponStatus,
  Prisma,
  PromotionPlacement,
  PromotionStatus,
  PromotionTargetType,
  prisma,
} from "@aagam/database";
import { UpsertCouponDto, UpsertPromotionCampaignDto } from "./promotions.dto";

type DbClient = Prisma.TransactionClient | typeof prisma;
type PricingLine = {
  productId: string;
  categoryId: string;
  lineTotalPaise: number;
};

const couponInclude = {
  store: { select: { id: true, name: true } },
  productEligibilities: { select: { productId: true } },
  categoryEligibilities: { select: { categoryId: true } },
  _count: { select: { redemptions: true, campaigns: true } },
} satisfies Prisma.CouponInclude;

const campaignInclude = {
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

@Injectable()
export class PromotionsService {
  private requireText(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private date(value?: string | Date | null) {
    return value ? new Date(value) : null;
  }

  private validateSchedule(
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

  private validateInternalPath(path?: string | null) {
    if (!path || !/^\/shop(?:[/?#]|$)/.test(path) || path.startsWith("//")) {
      throw new BadRequestException(
        "Campaign paths must be internal /shop routes"
      );
    }
  }

  private async validateCampaignTarget(input: {
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

  private campaignTargetUrl(campaign: any) {
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

  private effectiveStatus(
    status: string,
    startsAt?: Date | null,
    endsAt?: Date | null
  ) {
    const now = Date.now();
    if (status === PromotionStatus.ARCHIVED) return "ARCHIVED";
    if (status === PromotionStatus.PAUSED) return "PAUSED";
    if (status === PromotionStatus.DRAFT) return "DRAFT";
    if (startsAt && startsAt.getTime() > now) return "SCHEDULED";
    if (endsAt && endsAt.getTime() < now) return "EXPIRED";
    return "ACTIVE";
  }

  private publicCampaign(campaign: any) {
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

  async activeCampaigns(userId: string, placement?: PromotionPlacement) {
    const now = new Date();
    const hasPriorOrder = await prisma.order.count({
      where: {
        customerId: userId,
        status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] },
      },
    });
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
    const status = dto.status ?? PromotionStatus.DRAFT;
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
    const status = dto.status ?? current.status;
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

  private validateCouponRule(input: {
    discountType: CouponDiscountType;
    percentageBps?: number | null;
    amountPaise?: number | null;
    maxDiscountPaise?: number | null;
    eligibilityScope: CouponEligibilityScope;
    eligibleProductIds?: string[];
    eligibleCategoryIds?: string[];
  }) {
    if (
      input.discountType === CouponDiscountType.PERCENTAGE &&
      (!input.percentageBps ||
        input.percentageBps < 1 ||
        input.percentageBps > 10000)
    ) {
      throw new BadRequestException(
        "Percentage coupons require 1-10000 basis points"
      );
    }
    if (
      input.discountType === CouponDiscountType.FIXED_AMOUNT &&
      (!input.amountPaise || input.amountPaise < 1)
    ) {
      throw new BadRequestException("Fixed coupons require an amount");
    }
    if (
      input.eligibilityScope === CouponEligibilityScope.PRODUCTS &&
      !input.eligibleProductIds?.length
    ) {
      throw new BadRequestException("Select eligible products");
    }
    if (
      input.eligibilityScope === CouponEligibilityScope.CATEGORIES &&
      !input.eligibleCategoryIds?.length
    ) {
      throw new BadRequestException("Select eligible categories");
    }
  }

  private async validateCouponReferences(input: {
    storeId?: string | null;
    productIds?: string[];
    categoryIds?: string[];
  }) {
    if (input.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: input.storeId, deletedAt: null },
        select: { id: true },
      });
      if (!store) throw new BadRequestException("Coupon store does not exist");
    }
    if (input.productIds?.length) {
      const count = await prisma.product.count({
        where: { id: { in: input.productIds }, deletedAt: null },
      });
      if (count !== input.productIds.length)
        throw new BadRequestException(
          "One or more eligible products do not exist"
        );
    }
    if (input.categoryIds?.length) {
      const count = await prisma.category.count({
        where: { id: { in: input.categoryIds } },
      });
      if (count !== input.categoryIds.length)
        throw new BadRequestException(
          "One or more eligible categories do not exist"
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

  async createCoupon(adminUserId: string, dto: UpsertCouponDto) {
    const code = this.requireText(dto.code, "Coupon code").toUpperCase();
    const name = this.requireText(dto.name, "Coupon name");
    const discountType = dto.discountType;
    if (!discountType)
      throw new BadRequestException("Discount type is required");
    const eligibilityScope = dto.eligibilityScope ?? CouponEligibilityScope.ALL;
    this.validateSchedule(dto.startsAt, dto.endsAt);
    this.validateCouponRule({ ...dto, discountType, eligibilityScope });
    await this.validateCouponReferences({
      storeId: dto.storeId,
      productIds: dto.eligibleProductIds,
      categoryIds: dto.eligibleCategoryIds,
    });
    const duplicate = await prisma.coupon.findUnique({
      where: { code },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException("Coupon code already exists");
    return prisma.coupon.create({
      data: {
        code,
        name,
        description: dto.description?.trim() || null,
        status: dto.status ?? CouponStatus.DRAFT,
        applicationMode: dto.applicationMode ?? CouponApplicationMode.CODE,
        discountType,
        percentageBps:
          discountType === CouponDiscountType.PERCENTAGE
            ? dto.percentageBps
            : null,
        amountPaise:
          discountType === CouponDiscountType.FIXED_AMOUNT
            ? dto.amountPaise
            : null,
        maxDiscountPaise:
          discountType === CouponDiscountType.PERCENTAGE
            ? dto.maxDiscountPaise ?? null
            : null,
        minimumSubtotalPaise: dto.minimumSubtotalPaise ?? 0,
        startsAt: this.date(dto.startsAt),
        endsAt: this.date(dto.endsAt),
        totalUsageLimit: dto.totalUsageLimit ?? null,
        perCustomerLimit: dto.perCustomerLimit ?? 1,
        firstOrderOnly: dto.firstOrderOnly ?? false,
        eligibilityScope,
        priority: dto.priority ?? 0,
        storeId: dto.storeId || null,
        createdByUserId: adminUserId,
        productEligibilities:
          eligibilityScope === CouponEligibilityScope.PRODUCTS
            ? {
                create: (dto.eligibleProductIds || []).map((productId) => ({
                  productId,
                })),
              }
            : undefined,
        categoryEligibilities:
          eligibilityScope === CouponEligibilityScope.CATEGORIES
            ? {
                create: (dto.eligibleCategoryIds || []).map((categoryId) => ({
                  categoryId,
                })),
              }
            : undefined,
      },
      include: couponInclude,
    });
  }

  async updateCoupon(id: string, dto: UpsertCouponDto) {
    const current = await prisma.coupon.findUnique({
      where: { id },
      include: {
        productEligibilities: true,
        categoryEligibilities: true,
        _count: { select: { redemptions: true } },
      },
    });
    if (!current) throw new NotFoundException("Coupon not found");
    const code = dto.code ? dto.code.trim().toUpperCase() : current.code;
    if (code !== current.code && current._count.redemptions > 0)
      throw new ConflictException("Coupon code is immutable after redemption");
    if (code !== current.code) {
      const duplicate = await prisma.coupon.findUnique({
        where: { code },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException("Coupon code already exists");
    }
    const discountType = dto.discountType ?? current.discountType;
    const eligibilityScope = dto.eligibilityScope ?? current.eligibilityScope;
    const eligibleProductIds =
      dto.eligibleProductIds ??
      current.productEligibilities.map((row) => row.productId);
    const eligibleCategoryIds =
      dto.eligibleCategoryIds ??
      current.categoryEligibilities.map((row) => row.categoryId);
    const percentageBps = dto.percentageBps ?? current.percentageBps;
    const amountPaise = dto.amountPaise ?? current.amountPaise;
    this.validateSchedule(
      dto.startsAt ?? current.startsAt,
      dto.endsAt ?? current.endsAt
    );
    this.validateCouponRule({
      discountType,
      eligibilityScope,
      percentageBps,
      amountPaise,
      maxDiscountPaise: dto.maxDiscountPaise ?? current.maxDiscountPaise,
      eligibleProductIds,
      eligibleCategoryIds,
    });
    await this.validateCouponReferences({
      storeId: dto.storeId !== undefined ? dto.storeId : current.storeId,
      productIds: eligibleProductIds,
      categoryIds: eligibleCategoryIds,
    });
    return prisma.$transaction(async (tx) => {
      if (
        dto.eligibilityScope !== undefined ||
        dto.eligibleProductIds !== undefined ||
        dto.eligibleCategoryIds !== undefined
      ) {
        await tx.couponProductEligibility.deleteMany({
          where: { couponId: id },
        });
        await tx.couponCategoryEligibility.deleteMany({
          where: { couponId: id },
        });
        if (eligibilityScope === CouponEligibilityScope.PRODUCTS) {
          await tx.couponProductEligibility.createMany({
            data: eligibleProductIds.map((productId) => ({
              couponId: id,
              productId,
            })),
          });
        }
        if (eligibilityScope === CouponEligibilityScope.CATEGORIES) {
          await tx.couponCategoryEligibility.createMany({
            data: eligibleCategoryIds.map((categoryId) => ({
              couponId: id,
              categoryId,
            })),
          });
        }
      }
      return tx.coupon.update({
        where: { id },
        data: {
          code,
          ...(dto.name !== undefined
            ? { name: this.requireText(dto.name, "Coupon name") }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.applicationMode !== undefined
            ? { applicationMode: dto.applicationMode }
            : {}),
          discountType,
          percentageBps:
            discountType === CouponDiscountType.PERCENTAGE
              ? percentageBps
              : null,
          amountPaise:
            discountType === CouponDiscountType.FIXED_AMOUNT
              ? amountPaise
              : null,
          maxDiscountPaise:
            discountType === CouponDiscountType.PERCENTAGE
              ? dto.maxDiscountPaise !== undefined
                ? dto.maxDiscountPaise
                : current.maxDiscountPaise
              : null,
          ...(dto.minimumSubtotalPaise !== undefined
            ? { minimumSubtotalPaise: dto.minimumSubtotalPaise }
            : {}),
          ...(dto.startsAt !== undefined
            ? { startsAt: this.date(dto.startsAt) }
            : {}),
          ...(dto.endsAt !== undefined
            ? { endsAt: this.date(dto.endsAt) }
            : {}),
          ...(dto.totalUsageLimit !== undefined
            ? { totalUsageLimit: dto.totalUsageLimit }
            : {}),
          ...(dto.perCustomerLimit !== undefined
            ? { perCustomerLimit: dto.perCustomerLimit }
            : {}),
          ...(dto.firstOrderOnly !== undefined
            ? { firstOrderOnly: dto.firstOrderOnly }
            : {}),
          eligibilityScope,
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.storeId !== undefined
            ? { storeId: dto.storeId || null }
            : {}),
        },
        include: couponInclude,
      });
    });
  }

  async archiveCoupon(id: string) {
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!coupon) throw new NotFoundException("Coupon not found");
    return prisma.coupon.update({
      where: { id },
      data: { status: CouponStatus.ARCHIVED },
    });
  }

  private async evaluateCoupon(
    coupon: any,
    input: {
      userId: string;
      storeId: string;
      subtotalPaise: number;
      deliveryFeePaise: number;
      lines: PricingLine[];
    },
    db: DbClient
  ) {
    const now = new Date();
    if (![CouponStatus.ACTIVE, CouponStatus.SCHEDULED].includes(coupon.status))
      throw new BadRequestException("Coupon is not active");
    if (coupon.startsAt && coupon.startsAt > now)
      throw new BadRequestException("Coupon has not started yet");
    if (coupon.endsAt && coupon.endsAt <= now)
      throw new BadRequestException("Coupon has expired");
    if (coupon.storeId && coupon.storeId !== input.storeId)
      throw new BadRequestException("Coupon is not valid for this store");
    if (input.subtotalPaise < coupon.minimumSubtotalPaise) {
      throw new BadRequestException(
        `Minimum cart value is ₹${(coupon.minimumSubtotalPaise / 100).toFixed(
          2
        )}`
      );
    }
    if (coupon.firstOrderOnly) {
      const priorOrders = await db.order.count({
        where: {
          customerId: input.userId,
          status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] },
        },
      });
      if (priorOrders > 0)
        throw new BadRequestException(
          "Coupon is only valid on the first order"
        );
    }
    const countedStatuses = [
      CouponRedemptionStatus.RESERVED,
      CouponRedemptionStatus.REDEEMED,
    ];
    const [totalUses, customerUses] = await Promise.all([
      db.couponRedemption.count({
        where: { couponId: coupon.id, status: { in: countedStatuses } },
      }),
      db.couponRedemption.count({
        where: {
          couponId: coupon.id,
          customerId: input.userId,
          status: { in: countedStatuses },
        },
      }),
    ]);
    if (coupon.totalUsageLimit && totalUses >= coupon.totalUsageLimit)
      throw new BadRequestException("Coupon usage limit has been reached");
    if (customerUses >= coupon.perCustomerLimit)
      throw new BadRequestException(
        "Coupon usage limit for this account has been reached"
      );

    const productIds = new Set(
      coupon.productEligibilities.map((row: any) => row.productId)
    );
    const categoryIds = new Set(
      coupon.categoryEligibilities.map((row: any) => row.categoryId)
    );
    let eligibleSubtotalPaise = input.subtotalPaise;
    if (coupon.eligibilityScope === CouponEligibilityScope.PRODUCTS) {
      eligibleSubtotalPaise = input.lines
        .filter((line) => productIds.has(line.productId))
        .reduce((sum, line) => sum + line.lineTotalPaise, 0);
    }
    if (coupon.eligibilityScope === CouponEligibilityScope.CATEGORIES) {
      eligibleSubtotalPaise = input.lines
        .filter((line) => categoryIds.has(line.categoryId))
        .reduce((sum, line) => sum + line.lineTotalPaise, 0);
    }
    if (eligibleSubtotalPaise <= 0)
      throw new BadRequestException(
        "Cart has no items eligible for this coupon"
      );

    let discountPaise = 0;
    if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
      discountPaise = Math.floor(
        (eligibleSubtotalPaise * coupon.percentageBps) / 10000
      );
      if (coupon.maxDiscountPaise)
        discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
    } else if (coupon.discountType === CouponDiscountType.FIXED_AMOUNT) {
      discountPaise = Math.min(coupon.amountPaise, eligibleSubtotalPaise);
    } else if (coupon.discountType === CouponDiscountType.FREE_DELIVERY) {
      discountPaise = input.deliveryFeePaise;
    }
    discountPaise = Math.max(
      0,
      Math.min(discountPaise, input.subtotalPaise + input.deliveryFeePaise)
    );
    if (discountPaise <= 0)
      throw new BadRequestException("Coupon does not reduce this order total");

    return {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discountType,
        applicationMode: coupon.applicationMode,
      },
      discountPaise,
      eligibleSubtotalPaise,
      ruleSnapshot: {
        code: coupon.code,
        discountType: coupon.discountType,
        percentageBps: coupon.percentageBps,
        amountPaise: coupon.amountPaise,
        maxDiscountPaise: coupon.maxDiscountPaise,
        minimumSubtotalPaise: coupon.minimumSubtotalPaise,
        eligibilityScope: coupon.eligibilityScope,
        storeId: coupon.storeId,
      },
    };
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
    const include = {
      productEligibilities: { select: { productId: true } },
      categoryEligibilities: { select: { categoryId: true } },
    };
    const code = input.couponCode?.trim().toUpperCase();
    if (code) {
      const coupon = await db.coupon.findUnique({ where: { code }, include });
      if (!coupon) throw new BadRequestException("Coupon code is invalid");
      return this.evaluateCoupon(coupon, input, db);
    }
    const now = new Date();
    const autoCoupons = await db.coupon.findMany({
      where: {
        applicationMode: CouponApplicationMode.AUTO,
        status: { in: [CouponStatus.ACTIVE, CouponStatus.SCHEDULED] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
        OR: [{ storeId: null }, { storeId: input.storeId }],
      },
      include,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 20,
    });
    for (const coupon of autoCoupons) {
      try {
        return await this.evaluateCoupon(coupon, input, db);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
      }
    }
    return {
      coupon: null,
      discountPaise: 0,
      eligibleSubtotalPaise: 0,
      ruleSnapshot: null,
    };
  }

  private async publicCoupons(userId: string) {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({
      where: {
        status: { in: [CouponStatus.ACTIVE, CouponStatus.SCHEDULED] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      include: couponInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    const priorOrders = await prisma.order.count({
      where: {
        customerId: userId,
        status: { notIn: ["CANCELLED", "PAYMENT_FAILED"] },
      },
    });
    const [usage, totalUsage] = await Promise.all([
      prisma.couponRedemption.groupBy({
        by: ["couponId"],
        where: {
          customerId: userId,
          status: {
            in: [
              CouponRedemptionStatus.RESERVED,
              CouponRedemptionStatus.REDEEMED,
            ],
          },
        },
        _count: { _all: true },
      }),
      prisma.couponRedemption.groupBy({
        by: ["couponId"],
        where: {
          status: {
            in: [
              CouponRedemptionStatus.RESERVED,
              CouponRedemptionStatus.REDEEMED,
            ],
          },
        },
        _count: { _all: true },
      }),
    ]);
    const usageMap = new Map(
      usage.map((row) => [row.couponId, row._count._all])
    );
    const totalUsageMap = new Map(
      totalUsage.map((row) => [row.couponId, row._count._all])
    );
    return coupons.map((coupon) => {
      const used = usageMap.get(coupon.id) || 0;
      const globallyExhausted = Boolean(
        coupon.totalUsageLimit &&
          (totalUsageMap.get(coupon.id) || 0) >= coupon.totalUsageLimit
      );
      const eligible =
        !globallyExhausted &&
        !(coupon.firstOrderOnly && priorOrders > 0) &&
        used < coupon.perCustomerLimit;
      return {
        id: coupon.id,
        code:
          coupon.applicationMode === CouponApplicationMode.CODE
            ? coupon.code
            : null,
        name: coupon.name,
        description: coupon.description,
        applicationMode: coupon.applicationMode,
        discountType: coupon.discountType,
        percentageBps: coupon.percentageBps,
        amountPaise: coupon.amountPaise,
        maxDiscountPaise: coupon.maxDiscountPaise,
        minimumSubtotalPaise: coupon.minimumSubtotalPaise,
        firstOrderOnly: coupon.firstOrderOnly,
        eligibilityScope: coupon.eligibilityScope,
        startsAt: coupon.startsAt,
        endsAt: coupon.endsAt,
        store: coupon.store,
        eligible,
        ineligibleReason: !eligible
          ? globallyExhausted
            ? "Offer usage limit reached"
            : coupon.firstOrderOnly && priorOrders > 0
            ? "First order only"
            : "Account usage limit reached"
          : null,
      };
    });
  }

  async deals(userId: string) {
    const [campaigns, coupons] = await Promise.all([
      this.activeCampaigns(userId, PromotionPlacement.DEALS_PAGE),
      this.publicCoupons(userId),
    ]);
    return {
      serverTime: campaigns.serverTime,
      campaigns: campaigns.placements.DEALS_PAGE,
      coupons,
    };
  }
}
