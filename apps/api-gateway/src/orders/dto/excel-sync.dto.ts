import { IsOptional, IsString } from 'class-validator';

export class ExcelSyncDto {
  @IsOptional()
  @IsString()
  since?: string;
}

