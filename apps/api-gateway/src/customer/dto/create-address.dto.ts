import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

  // Coordinates are optional for a text/manual address. The server forward
  // geocodes that address for routing while preserving GEOCODED provenance.
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  localityId?: string;

  @IsOptional()
  @IsIn(['LIVE_GPS', 'MAP_PIN', 'GEOCODED'])
  locationSource?: 'LIVE_GPS' | 'MAP_PIN' | 'GEOCODED';

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(10000)
  locationAccuracyMetres?: number;

  @IsOptional()
  @IsDateString()
  locationCapturedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
