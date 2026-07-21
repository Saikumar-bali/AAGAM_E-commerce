import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddStoreProductDto {
  @IsString()
  productId: string = '';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  openingQuantity: number = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number | null;

  @IsBoolean()
  @IsOptional()
  isListed?: boolean;

  @IsBoolean()
  @IsOptional()
  autoHideWhenOutOfStock?: boolean;
}
