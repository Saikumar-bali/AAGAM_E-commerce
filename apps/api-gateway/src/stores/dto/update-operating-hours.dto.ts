import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class OperatingWindowDto {
  @IsInt()
  @Min(0)
  @Max(1439)
  openMinute: number = 0;

  @IsInt()
  @Min(0)
  @Max(1439)
  closeMinute: number = 0;
}

export class OperatingDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number = 0;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperatingWindowDto)
  windows: OperatingWindowDto[] = [];
}

export class UpdateOperatingHoursDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperatingDayDto)
  operatingHours?: OperatingDayDto[] | null;

  @IsOptional()
  @IsString()
  timezone?: string;
}