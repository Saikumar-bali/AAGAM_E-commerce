import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export enum DeliveryFailureReason {
  CUSTOMER_UNREACHABLE = "CUSTOMER_UNREACHABLE",
  CUSTOMER_REFUSED = "CUSTOMER_REFUSED",
  ADDRESS_NOT_FOUND = "ADDRESS_NOT_FOUND",
  WRONG_ADDRESS = "WRONG_ADDRESS",
  PAYMENT_NOT_AVAILABLE = "PAYMENT_NOT_AVAILABLE",
  VEHICLE_BREAKDOWN = "VEHICLE_BREAKDOWN",
  PACKAGE_DAMAGED = "PACKAGE_DAMAGED",
  SAFETY_CONCERN = "SAFETY_CONCERN",
  OTHER = "OTHER",
}

export enum PickupVerificationMethodDto {
  STORE_PICKUP_PIN = "STORE_PICKUP_PIN",
  QR_CODE = "QR_CODE",
  STORE_CONFIRMED_HANDOFF = "STORE_CONFIRMED_HANDOFF",
}

export enum DeliveryResolutionActionDto {
  RETRY_DELIVERY = "RETRY_DELIVERY",
  REASSIGN_RIDER = "REASSIGN_RIDER",
  RETURN_TO_STORE = "RETURN_TO_STORE",
  CANCEL_AND_REFUND = "CANCEL_AND_REFUND",
  ESCALATE_TO_ADMIN = "ESCALATE_TO_ADMIN",
}

export class IssuePickupChallengeDto {
  @IsEnum(PickupVerificationMethodDto)
  method!: PickupVerificationMethodDto;

  @IsInt()
  @Min(1)
  @Max(100)
  parcelCount!: number;
}

export class PickupCoordinatesDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  accuracyMetres?: number;
}

export class VerifyPickupProofDto extends PickupCoordinatesDto {
  @IsEnum(PickupVerificationMethodDto)
  method!: PickupVerificationMethodDto;

  @IsString()
  @MinLength(6)
  @MaxLength(160)
  code!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  parcelCount!: number;
}

export class ConfirmStoreHandoffDto extends PickupCoordinatesDto {
  @IsInt()
  @Min(1)
  @Max(100)
  parcelCount!: number;
}

export enum ReturnDisposition {
  SELLABLE = "SELLABLE",
  DAMAGED = "DAMAGED",
  MISSING = "MISSING",
}

export class RecordDeliveryFailureDto {
  @IsEnum(DeliveryFailureReason)
  reason!: DeliveryFailureReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CompleteDeliveryOperationDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  otpCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  proofType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsBoolean()
  riderConfirmed?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  accuracyMetres?: number;
}

export class CollectCodDto {
  @IsInt()
  @Min(1)
  amountPaise!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  collectionReference?: string;
}

export class SettleCodDto {
  @IsInt()
  @Min(1)
  amountPaise!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  settlementReference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  finalize?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  varianceReason?: string;
}

export class ResolveDeliveryFailureDto {
  @IsOptional()
  @IsEnum(DeliveryResolutionActionDto)
  action?: DeliveryResolutionActionDto;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  overrideReason?: string;
}

export class ReturnInspectionLineDto {
  @IsString()
  @MinLength(1)
  orderItemId!: string;

  @IsEnum(ReturnDisposition)
  disposition!: ReturnDisposition;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ReturnInspectionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnInspectionLineDto)
  lines!: ReturnInspectionLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
