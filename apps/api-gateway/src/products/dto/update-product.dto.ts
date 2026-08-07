import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  mrp?: number;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  categoryId?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsArray()
  @IsOptional()
  images?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  details?: any;

  /** Authoritative per-unit routing weight, independent of details.weight. */
  @IsInt()
  @Min(1)
  @IsOptional()
  weightGrams?: number;
}
