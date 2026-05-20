import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@aagam/database';

export class UpdateOrderStatusDto {
  @Transform(({ value }) => String(value || '').toUpperCase())
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  riderId?: string;
}
