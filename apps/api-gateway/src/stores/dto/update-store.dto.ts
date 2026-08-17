import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StoreOperatingWindowDto {
  @IsInt()
  @Min(0)
  @Max(1439)
  openMinute: number = 0;

  @IsInt()
  @Min(0)
  @Max(1439)
  closeMinute: number = 0;
}

export class StoreOperatingDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number = 0;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreOperatingWindowDto)
  windows: StoreOperatingWindowDto[] = [];
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreOperatingDayDto)
  operatingHours?: StoreOperatingDayDto[] | null;

  @IsOptional()
  @IsString()
  timezone?: string;
}
