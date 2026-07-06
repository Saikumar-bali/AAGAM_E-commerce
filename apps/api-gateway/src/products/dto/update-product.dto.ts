import { IsString, IsNumber, IsOptional, IsNotEmpty, IsObject } from 'class-validator';

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

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  categoryId?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsObject()
  @IsOptional()
  details?: any;
}
