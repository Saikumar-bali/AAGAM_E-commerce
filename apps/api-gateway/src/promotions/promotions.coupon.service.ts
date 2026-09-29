/**
 * Coupon authoring and validation.
 *
 * Split out of the former promotions.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponApplicationMode, CouponDiscountType, CouponEligibilityScope, CouponStatus, prisma } from '@aagam/database';
import { UpsertCouponDto } from './promotions.dto';
import { PromotionsServiceBase } from './promotions.service.base';
import { couponInclude } from './promotions.shared';

@Injectable()
export class PromotionCouponService extends PromotionsServiceBase {
  protected validateCouponRule(input: {
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

  protected async validateCouponReferences(input: {
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
}
