import { IsEmail, IsEnum, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PartnerApplicationType } from '../partner-onboarding.types';

const PHONE_INPUT = /^(?:\+[1-9]\d{7,14}|\d{10}|91\d{10})$/;

export class AdminCreateInternalPartnerDto {
  @IsEnum(PartnerApplicationType)
  type!: PartnerApplicationType;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  applicantName!: string;

  @Matches(PHONE_INPUT)
  phoneE164!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class AdminUpdateInternalPartnerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  applicantName?: string;

  @IsOptional()
  @Matches(PHONE_INPUT)
  phoneE164?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class AdminSubmitInternalPartnerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
