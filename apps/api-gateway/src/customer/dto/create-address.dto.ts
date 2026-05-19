import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  label?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  recipientName!: string;

  // Rider calling contact. Accept +E.164 or 10 digit Indian number (normalized server-side).
  @IsString()
  @Matches(/^(\+?[1-9]\d{7,14}|\d{10})$/)
  phoneE164!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+?[1-9]\d{7,14}|\d{10})$/)
  alternatePhoneE164?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  landmark?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  state!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  pincode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
