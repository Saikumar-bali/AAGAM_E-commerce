import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ORDER_STATUS_VALUES } from '@aagam/types';

/** Query for the paginated admin/store order lists. */
export class OrderListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize: number = 25;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsIn([...ORDER_STATUS_VALUES, 'All'])
  @IsOptional()
  status?: string;
}
