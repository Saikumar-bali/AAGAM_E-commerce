import { IsOptional, IsString } from 'class-validator';

export class ForceCancelOrderDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
