import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum DeliveryFailureReason {
  CUSTOMER_UNAVAILABLE = 'CUSTOMER_UNAVAILABLE',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  CUSTOMER_REFUSED = 'CUSTOMER_REFUSED',
  PAYMENT_ISSUE = 'PAYMENT_ISSUE',
  UNSAFE_LOCATION = 'UNSAFE_LOCATION',
  OTHER = 'OTHER',
}

export enum ReturnDisposition {
  SELLABLE = 'SELLABLE',
  DAMAGED = 'DAMAGED',
  MISSING = 'MISSING',
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
  @MinLength(4)
  @MaxLength(8)
  otpCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  proofType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
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
