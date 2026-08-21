import { IsArray, IsBoolean, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateServiceableLocalityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string = '';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  aliases?: string[];

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city: string = '';

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  state?: string;

  @IsString()
  @Matches(/^\d{6}$/)
  pincode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  zoneId?: string | null;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radius?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}