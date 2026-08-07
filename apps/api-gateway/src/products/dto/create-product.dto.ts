import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string = '';

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  price: number = 0;

  @IsNumber()
  @IsOptional()
  mrp?: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string = '';

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

  /**
   * Authoritative per-unit routing weight. This is intentionally separate from
   * details.weight, which is customer-facing free text such as "500 ml".
   */
  @IsInt()
  @Min(1)
  @IsOptional()
  weightGrams?: number;
}
