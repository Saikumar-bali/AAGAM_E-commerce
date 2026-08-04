import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class RiderHistoryQueryDto {
  @IsOptional()
  @IsIn([
    "ALL",
    "DELIVERED",
    "DELIVERY_FAILED",
    "CANCELLED",
    "RETURNED_TO_STORE",
  ])
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class RiderStatusDto {
  @IsIn(["ONLINE", "OFFLINE"])
  status!: "ONLINE" | "OFFLINE";
}

export class RiderAvailabilityEntryDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;

  @IsBoolean()
  isAvailable!: boolean;
}

export class RiderAvailabilityDto {
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => RiderAvailabilityEntryDto)
  entries!: RiderAvailabilityEntryDto[];
}

export class RiderBreakDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class RiderProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  vehicleType?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9 -]{4,20}$/)
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  emergencyContactName?: string;

  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  emergencyContactPhone?: string;

  @IsOptional()
  @Matches(/^\d{8,24}$/)
  bankAccountNumber?: string;

  @IsOptional()
  @Matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/)
  bankIfsc?: string;
}

export class RiderDocumentDto {
  @IsIn([
    "DRIVING_LICENSE",
    "IDENTITY",
    "VEHICLE_REGISTRATION",
    "VEHICLE_INSURANCE",
    "OTHER",
  ])
  type!: string;

  @Matches(/^evidence\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/)
  @MaxLength(1000)
  storageKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  documentNumberLast4?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class PickupChecklistLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  orderItemId!: string;

  @IsInt()
  @Min(0)
  checkedQuantity!: number;
}

export class VerifyPickupDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PickupChecklistLineDto)
  lines!: PickupChecklistLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parcelCode?: string;
}

export class PickupProblemDto {
  @IsIn([
    "MISSING_ITEM",
    "WRONG_QUANTITY",
    "DAMAGED_PARCEL",
    "UNSEALED_PARCEL",
    "OTHER",
  ])
  problemType!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note!: string;
}

export class RiderSupportTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryJobId?: string;

  @IsIn([
    "DELIVERY",
    "PICKUP",
    "CUSTOMER",
    "STORE",
    "PAYMENT",
    "SAFETY",
    "APP",
    "OTHER",
  ])
  category!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @Matches(/^evidence\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/, { each: true })
  evidenceKeys?: string[];
}

export class RiderSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @Matches(/^evidence\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/, { each: true })
  evidenceKeys?: string[];
}

export class AdminRiderShiftDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminRiderEarningDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryJobId?: string;

  @IsIn(["BASE_DELIVERY_FEE", "DISTANCE_INCENTIVE", "BONUS", "PENALTY"])
  type!: string;

  @IsInt()
  @Min(1)
  amountPaise!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reference!: string;

  @IsOptional()
  @IsDateString()
  earnedAt?: string;
}

export class AdminRiderReviewDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminSupportStatusDto {
  @IsIn(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
  status!: string;
}
