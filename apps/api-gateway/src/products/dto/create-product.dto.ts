import { IsString, IsNumber, IsOptional, IsUUID, IsNotEmpty } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string = '';

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  price: number = 0;

  @IsString()
  @IsNotEmpty()
  categoryId: string = '';

  @IsString()
  @IsOptional()
  image?: string;
}
