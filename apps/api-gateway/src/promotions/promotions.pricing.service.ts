/**
 * Coupon evaluation and discount pricing.
 *
 * Split out of the former promotions.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { CouponApplicationMode, CouponDiscountType, CouponEligibilityScope, CouponRedemptionStatus, CouponStatus, prisma } from '@aagam/database';
import { PromotionsServiceBase } from './promotions.service.base';
import { couponInclude, DbClient, PricingLine } from './promotions.shared';

@Injectable()
export class PromotionPricingService extends PromotionsServiceBase {
  protected async evaluateCoupon(
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

  async publicCoupons(userId: string) {
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
}
