import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum RouteSplitMethod {
  AUTOMATIC_GEOGRAPHIC = 'AUTOMATIC_GEOGRAPHIC',
  SELECTED_STOPS = 'SELECTED_STOPS',
  MAX_STOPS = 'MAX_STOPS',
  TIME_CAPACITY = 'TIME_CAPACITY',
}

export class CoordinateDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class DeliverySlotDto {
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class UpsertRegionalDeliveryZoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  polygon?: CoordinateDto[];

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLongitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(250)
  fallbackRadiusKm?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => DeliverySlotDto)
  deliverySlots?: DeliverySlotDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maximumDailySubscriptionCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maximumStopsPerRun?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  maximumRouteDistanceKm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  maximumEstimatedDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maximumParcelCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100000)
  maximumWeightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000000)
  cashRiskLimitPaise?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  slotEndBufferMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  allowedVehicleTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  neighbouringZoneIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  storeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  preferredRiderIds?: string[];
}

export class PlanRegionalRoutesDto {
  @IsOptional()
  @IsDateString()
  serviceDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  assignRiders?: boolean;
}

export class PreviewRouteSplitDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsEnum(RouteSplitMethod)
  method!: RouteSplitMethod;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  selectedStopIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maximumStops?: number;
}

export class SplitDeliveryRunDto extends PreviewRouteSplitDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  riderIds?: string[];
}

export class MergeDeliveryRunsDto {
  @IsInt()
  @Min(0)
  targetVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  sourceRunIds!: string[];

  @IsObject()
  sourceVersions!: Record<string, number>;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class MoveRunStopDto {
  @IsString()
  @MinLength(1)
  destinationRunId!: string;

  @IsInt()
  @Min(0)
  sourceRunVersion!: number;

  @IsInt()
  @Min(0)
  destinationRunVersion!: number;

  @IsInt()
  @Min(0)
  stopVersion!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReassignRegionalRunDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsString()
  @MinLength(1)
  riderId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReorderRegionalRunDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  orderedStopIds!: string[];

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class InterruptDeliveryRunDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  recoveryRiderId?: string;
}

export class CancelRegionalRunDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
