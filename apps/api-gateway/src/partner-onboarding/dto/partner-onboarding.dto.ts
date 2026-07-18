import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartnerApplicationType, PartnerContactChannel } from '../partner-onboarding.types';

export class CreatePartnerApplicationDto {
  @IsEnum(PartnerApplicationType)
  type!: PartnerApplicationType;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  applicantName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsPhoneNumber(null)
  phoneE164?: string;

  @IsOptional()
  @IsEnum(PartnerContactChannel)
  verificationChannel?: PartnerContactChannel;
}

export class RequestPartnerVerificationDto {
  @IsEnum(PartnerContactChannel)
  channel!: PartnerContactChannel;
}

export class VerifyPartnerContactDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class UpdatePartnerApplicationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  applicantName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsPhoneNumber(null)
  phoneE164?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class UploadPartnerDocumentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class ActivatePartnerAccountDto {
  @IsString()
  @MinLength(32)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(72)
  password!: string;
}

export class AdminPartnerListQueryDto {
  @IsOptional()
  @IsEnum(PartnerApplicationType)
  type?: PartnerApplicationType;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}

export class ReviewPartnerApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewPartnerDocumentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  decision!: 'VERIFIED' | 'REJECTED' | 'REPLACEMENT_REQUIRED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RequestPartnerChangesDto {
  @IsObject()
  requests!: Record<string, any>;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message!: string;
}

export class RejectPartnerApplicationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  reasonCode!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message!: string;
}

export class ApprovePartnerApplicationDto {
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  operationalName?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  initialServiceRadiusKm?: number;
}
