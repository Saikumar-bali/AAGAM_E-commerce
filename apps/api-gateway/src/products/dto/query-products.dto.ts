import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

const PRODUCT_SORT_VALUES = ['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'] as const;

export class QueryProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(PRODUCT_SORT_VALUES)
  sort?: (typeof PRODUCT_SORT_VALUES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeAvailability?: boolean;
}

export type ProductSortValue = NonNullable<QueryProductsDto['sort']>;
