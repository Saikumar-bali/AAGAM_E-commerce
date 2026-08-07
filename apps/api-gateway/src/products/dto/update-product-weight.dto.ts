import { IsInt, Min } from 'class-validator';

export class UpdateProductWeightDto {
  @IsInt()
  @Min(1)
  weightGrams: number = 0;
}
