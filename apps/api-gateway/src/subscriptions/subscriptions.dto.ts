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
  Matches,
} from 'class-validator';
import { DeliveryFailureReason } from '../orders/delivery-operations.dto';
import {
  SubscriptionDeliveryFrequency,
  SubscriptionDeliveryMethod,
  SubscriptionFundingCycle,
  SubscriptionIssueType,
  SubscriptionPlanStatus,
} from '@aagam/database';

export class SubscriptionPlanItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantityPerDelivery!: number;

  @IsOptional()
  @IsObject()
  substituteRules?: Record<string, unknown>;
}

export class UpsertSubscriptionPlanDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  internalName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mobileImageUrl?: string;

  @IsEnum(SubscriptionFundingCycle)
  fundingCycle!: SubscriptionFundingCycle;

  @IsInt()
  @Min(1)
  @Max(366)
  durationDays!: number;

  @IsInt()
  @Min(1)
  @Max(366)
  totalDeliveries!: number;

  @IsEnum(SubscriptionDeliveryFrequency)
  deliveryFrequency!: SubscriptionDeliveryFrequency;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  selectedWeekdays?: number[];

  @IsOptional()
  @IsObject()
  customSchedule?: Record<string, unknown>;

  @IsInt()
  @Min(1)
  pricePaise!: number;

  @IsInt()
  @Min(1)
  mrpPaise!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  defaultWindowStartMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  defaultWindowEndMinute!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  orderGenerationHoursBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  skipCutoffHours?: number;

  @IsOptional()
  @IsBoolean()
  allowPause?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSkip?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  maximumSkips?: number;

  @IsOptional()
  @IsBoolean()
  allowTrustedDrop?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPersonalHandover?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSecurityHandover?: boolean;

  @IsObject()
  proofPolicy!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isAutoRenewEnabled?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubscriptionPlanItemDto)
  items!: SubscriptionPlanItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  zoneIds?: string[];
}

export class UpdateSubscriptionPlanStatusDto {
  @IsEnum(SubscriptionPlanStatus)
  status!: SubscriptionPlanStatus;
}

export class QuoteSubscriptionDto {
  @IsString()
  addressId!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  deliveryWindowStartMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  deliveryWindowEndMinute?: number;

  @IsEnum(SubscriptionDeliveryMethod)
  deliveryMethod!: SubscriptionDeliveryMethod;
}

export class CreateCustomerSubscriptionDto extends QuoteSubscriptionDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  trustedDropInstructions?: string;
}

export class SkipSubscriptionDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class PauseSubscriptionDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ResumeSubscriptionDto {
  @IsOptional()
  @IsDateString()
  resumeFrom?: string;
}

export class UpdateSubscriptionPreferencesDto {
  @IsOptional()
  @IsEnum(SubscriptionDeliveryMethod)
  deliveryMethod?: SubscriptionDeliveryMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  trustedDropInstructions?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  deliveryWindowStartMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  deliveryWindowEndMinute?: number;
}

export class CancelSubscriptionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class ReportSubscriptionIssueDto {
  @IsEnum(SubscriptionIssueType)
  type!: SubscriptionIssueType;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class AssignDeliveryRunDto {
  @IsString()
  riderId!: string;

  @IsInt()
  @Min(0)
  version!: number;
}

export class RunVersionDto {
  @IsInt()
  @Min(0)
  version!: number;
}

export class ConfirmRunPackingDto extends RunVersionDto {
  @IsInt()
  @Min(1)
  expectedBagCount!: number;

  @IsInt()
  @Min(1)
  packedBagCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  crateCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  exceptionNote?: string;
}

export class ConfirmRunPickupReceiptDto extends RunVersionDto {
  @IsInt()
  @Min(1)
  expectedBagCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  crateCode?: string;
}

export class ArriveRunStopDto extends RunVersionDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  accuracyMetres?: number;
}

export class CompleteRunStopDto extends ArriveRunStopDto {
  @IsBoolean()
  riderConfirmed!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  otpCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(4096)
  trustedDropToken?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  evidenceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cashCollectedPaise?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class FailRunStopDto extends ArriveRunStopDto {
  @IsEnum(DeliveryFailureReason)
  reason!: DeliveryFailureReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  retryRequested?: boolean;
}

export class ReorderRunStopDto extends RunVersionDto {
  @IsInt()
  @Min(1)
  newSequenceNumber!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}


export class ConfirmRunStopReturnDto extends RunVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateCashDepositBatchDto extends RunVersionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  codLedgerIds!: string[];
}

export class SubmitCashDepositBatchDto extends RunVersionDto {
  @IsInt()
  @Min(0)
  submittedAmountPaise!: number;

  @IsOptional()
  @IsObject()
  receiptEvidence?: Record<string, unknown>;
}

export class VerifyCashDepositBatchDto extends RunVersionDto {
  @IsInt()
  @Min(0)
  verifiedAmountPaise!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  settlementReference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  varianceReason?: string;

  @IsOptional()
  @IsObject()
  receiptEvidence?: Record<string, unknown>;
}

export class ResolveCashVarianceDto extends RunVersionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsInt()
  adjustmentPaise!: number;
}

export class AdminSubscriptionCorrectionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;

  @IsInt()
  fundedDeliveryDelta!: number;

  @IsInt()
  amountDueDeltaPaise!: number;
}

export class ResolveSubscriptionIssueDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  resolution!: string;
}


export class IssueTrustedDropChallengeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  subscriptionDeliveryId?: string;
}

export class TrustedDropEvidenceUploadDto {
  @IsString()
  @MinLength(32)
  @MaxLength(4096)
  trustedDropToken!: string;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}
