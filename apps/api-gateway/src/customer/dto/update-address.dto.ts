import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+?[1-9]\d{7,14}|\d{10})$/)
  phoneE164?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+?[1-9]\d{7,14}|\d{10})$/)
  alternatePhoneE164?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  landmark?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  state?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
