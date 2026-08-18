import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DeliveryFeeMatchType } from '@aagam/database';

export class CreateDeliveryFeeRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string = '';

  @IsEnum(DeliveryFeeMatchType)
  matchType: DeliveryFeeMatchType = DeliveryFeeMatchType.KEYWORD;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  storeId?: string | null;

  @IsInt()
  @Min(0)
  ratePaisePerKm: number = 200;

  @IsOptional()
  @IsInt()
  @Min(0)
  flatFeePaise?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  freeDeliveryMinimumPaise?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(500)
  maximumDistanceKm?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeliveryFeeRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(DeliveryFeeMatchType)
  matchType?: DeliveryFeeMatchType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  storeId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  ratePaisePerKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  flatFeePaise?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  freeDeliveryMinimumPaise?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(500)
  maximumDistanceKm?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MatchTestDeliveryFeeRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  line2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  landmark?: string | null;

  @IsOptional()
  @IsString()
  storeId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  subtotalPaise?: number | null;

  @IsOptional()
  @IsBoolean()
  firstOrderEligible?: boolean;
}
