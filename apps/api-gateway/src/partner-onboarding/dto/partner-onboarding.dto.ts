import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartnerApplicationType, PartnerContactChannel } from '../partner-onboarding.types';

const PHONE_INPUT = /^(?:\+[1-9]\d{7,14}|\d{10}|91\d{10})$/;

export class CreatePartnerApplicationDto {
  @IsEnum(PartnerApplicationType)
  type!: PartnerApplicationType;
  @IsString() @MinLength(2) @MaxLength(120)
  applicantName!: string;
  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;
  @IsOptional() @Matches(PHONE_INPUT)
  phoneE164?: string;
  @IsOptional() @IsEnum(PartnerContactChannel)
  verificationChannel?: PartnerContactChannel;
}

export class RequestPartnerVerificationDto {
  @IsEnum(PartnerContactChannel)
  channel!: PartnerContactChannel;
  @IsOptional() @Matches(/^FIREBASE_PNV$/)
  fallbackFrom?: 'FIREBASE_PNV';
}

export class VerifyPartnerContactDto {
  @IsString() @Matches(/^\d{6}$/)
  code!: string;
}

export class ResumePartnerApplicationRequestDto {
  @IsString() @MinLength(5) @MaxLength(254)
  identifier!: string;
}

export class ResumePartnerApplicationVerifyDto extends ResumePartnerApplicationRequestDto {
  @IsString() @Matches(/^\d{6}$/)
  code!: string;
}

export class VerifyPartnerPnvDto {
  @IsString() @MinLength(40) @MaxLength(8192)
  token!: string;
}

export class UpdatePartnerApplicationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  applicantName?: string;
  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;
  @IsOptional() @Matches(PHONE_INPUT)
  phoneE164?: string;
  @IsOptional() @IsObject()
  payload?: Record<string, any>;
}

export class UploadPartnerDocumentDto {
  @IsString() @MinLength(2) @MaxLength(80)
  type!: string;
  @IsOptional() @IsString() @MaxLength(32)
  documentNumber?: string;
  @IsOptional() @IsString()
  expiresAt?: string;
}

export class ActivatePartnerAccountDto {
  @IsString() @MinLength(32)
  token!: string;
  @IsString() @MinLength(10) @MaxLength(72)
  password!: string;
}

export class AdminPartnerListQueryDto {
  @IsOptional() @IsEnum(PartnerApplicationType)
  type?: PartnerApplicationType;
  @IsOptional() @IsString()
  status?: string;
  @IsOptional() @IsString()
  search?: string;
  @IsOptional() @Matches(/^(active|deleted|all)$/)
  visibility: 'active' | 'deleted' | 'all' = 'active';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 25;
}

export class ReviewPartnerApplicationDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ReviewPartnerDocumentDto {
  @IsString() @Matches(/^(VERIFIED|REJECTED|REPLACEMENT_REQUIRED)$/)
  decision!: 'VERIFIED' | 'REJECTED' | 'REPLACEMENT_REQUIRED';
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class VerifyAllPartnerDocumentsDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class AdminVerifyPartnerContactDto {
  @IsEnum(PartnerContactChannel)
  channel!: PartnerContactChannel;
  @IsString() @Matches(/^(IN_PERSON|SUPPORT_VIDEO_CALL|DOCUMENT_MATCH|OTHER)$/)
  method!: 'IN_PERSON' | 'SUPPORT_VIDEO_CALL' | 'DOCUMENT_MATCH' | 'OTHER';
  @IsString() @MinLength(5) @MaxLength(1000)
  reason!: string;
}

export class DeletePartnerDraftDto {
  @IsString() @MinLength(5) @MaxLength(1000)
  reason!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90)
  retentionDays: number = 14;
}

export class RequestPartnerChangesDto {
  @IsObject()
  requests!: Record<string, any>;
  @IsString() @MinLength(5) @MaxLength(1000)
  message!: string;
}

export class RejectPartnerApplicationDto {
  @IsString() @MinLength(3) @MaxLength(80)
  reasonCode!: string;
  @IsString() @MinLength(5) @MaxLength(1000)
  message!: string;
}

export class ApprovePartnerApplicationDto {
  @IsOptional() @IsEmail()
  ownerEmail?: string;
  @IsOptional() @IsString() @MaxLength(120)
  operationalName?: string;
  @IsOptional() @IsNumber()
  latitude?: number;
  @IsOptional() @IsNumber()
  longitude?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100)
  initialServiceRadiusKm?: number;
}
