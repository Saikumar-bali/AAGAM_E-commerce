import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ListLocalitiesQueryDto {
  @IsOptional()
  @Matches(/^\d{6}$/)
  pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class AdminListLocalitiesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;
}