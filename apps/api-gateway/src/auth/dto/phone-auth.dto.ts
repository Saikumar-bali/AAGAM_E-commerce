import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum CustomerPhoneOtpPurpose {
  LOGIN = 'LOGIN',
  SIGNUP = 'SIGNUP',
}

export class RequestCustomerPhoneOtpDto {
  @IsString()
  @Matches(/^(?:\+[1-9]\d{7,14}|\d{10}|91\d{10})$/)
  phoneE164!: string;

  @IsEnum(CustomerPhoneOtpPurpose)
  purpose!: CustomerPhoneOtpPurpose;
}

export class VerifyCustomerPhoneOtpDto extends RequestCustomerPhoneOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
