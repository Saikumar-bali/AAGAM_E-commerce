import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export enum StoreStockReadinessDecision {
  READY = 'READY',
  SHORTAGE = 'SHORTAGE',
}

export class StoreStockReadinessDto {
  @IsEnum(StoreStockReadinessDecision)
  decision!: StoreStockReadinessDecision;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateSubscriptionPreparationPolicyDto {
  @IsInt()
  @Min(1)
  @Max(72)
  orderGenerationHoursBefore!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
