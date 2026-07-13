import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@aagam/database';

export class CheckoutItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CheckoutQuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @Transform(({ value }) => String(value || '').trim().toUpperCase())
  @Matches(/^[A-Z0-9_-]{3,32}$/)
  couponCode?: string;
}

export class CheckoutPlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsString()
  addressId!: string;

  @Transform(({ value }) => String(value || '').toUpperCase())
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @Transform(({ value }) => String(value || '').trim().toUpperCase())
  @Matches(/^[A-Z0-9_-]{3,32}$/)
  couponCode?: string;
}
