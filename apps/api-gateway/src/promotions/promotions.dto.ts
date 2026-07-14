import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Transform } from "class-transformer";
import {
  CouponApplicationMode,
  CouponDiscountType,
  CouponEligibilityScope,
  CouponStatus,
  PromotionPlacement,
  PromotionStatus,
  PromotionTargetType,
} from "@aagam/database";

export class UpsertPromotionCampaignDto {
  @IsOptional() @IsString() @Length(2, 120) internalName?: string;
  @IsOptional() @IsString() @Length(2, 140) title?: string;
  @IsOptional() @IsString() @MaxLength(220) subtitle?: string | null;
  @IsOptional() @IsString() @MaxLength(600) description?: string | null;
  @IsOptional() @IsString() @MaxLength(40) badgeText?: string | null;
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  imageUrl?: string | null;
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  mobileImageUrl?: string | null;
  @IsOptional() @IsHexColor() backgroundColor?: string;
  @IsOptional() @IsHexColor() textColor?: string;
  @IsOptional() @IsHexColor() accentColor?: string;
  @IsOptional() @IsString() @MaxLength(40) ctaLabel?: string;
  @IsOptional() @IsEnum(PromotionTargetType) targetType?: PromotionTargetType;
  @IsOptional() @IsString() @MaxLength(240) targetPath?: string | null;
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsString() couponId?: string | null;
  @IsOptional() @IsEnum(PromotionStatus) status?: PromotionStatus;
  @IsOptional() @IsISO8601() startsAt?: string | null;
  @IsOptional() @IsISO8601() endsAt?: string | null;
  @IsOptional() @IsInt() @Min(-1000) @Max(1000) priority?: number;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsEnum(PromotionPlacement, { each: true })
  placements?: PromotionPlacement[];
}

export class UpsertCouponDto {
  @IsOptional()
  @Transform(({ value }) =>
    value == null ? value : String(value).trim().toUpperCase()
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/)
  code?: string;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string | null;
  @IsOptional() @IsEnum(CouponStatus) status?: CouponStatus;
  @IsOptional()
  @IsEnum(CouponApplicationMode)
  applicationMode?: CouponApplicationMode;
  @IsOptional() @IsEnum(CouponDiscountType) discountType?: CouponDiscountType;
  @IsOptional() @IsInt() @Min(1) @Max(10000) percentageBps?: number;
  @IsOptional() @IsInt() @Min(1) amountPaise?: number | null;
  @IsOptional() @IsInt() @Min(1) maxDiscountPaise?: number | null;
  @IsOptional() @IsInt() @Min(0) minimumSubtotalPaise?: number;
  @IsOptional() @IsISO8601() startsAt?: string | null;
  @IsOptional() @IsISO8601() endsAt?: string | null;
  @IsOptional() @IsInt() @Min(1) totalUsageLimit?: number | null;
  @IsOptional() @IsInt() @Min(1) perCustomerLimit?: number;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional()
  @IsEnum(CouponEligibilityScope)
  eligibilityScope?: CouponEligibilityScope;
  @IsOptional() @IsInt() @Min(-1000) @Max(1000) priority?: number;
  @IsOptional() @IsString() storeId?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  eligibleProductIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  eligibleCategoryIds?: string[];
}

export class PromotionPlacementQueryDto {
  @IsOptional() @IsEnum(PromotionPlacement) placement?: PromotionPlacement;
}
