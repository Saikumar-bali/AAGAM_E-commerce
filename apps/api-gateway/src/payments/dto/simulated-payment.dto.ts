import { IsString } from 'class-validator';

export class SimulatedPaymentDto {
  @IsString()
  orderId!: string;
}

