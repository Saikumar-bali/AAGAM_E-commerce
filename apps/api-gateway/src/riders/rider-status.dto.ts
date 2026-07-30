import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export type RiderSelfStatus = 'ONLINE' | 'OFFLINE';
export type RiderAdminStatus = RiderSelfStatus | 'BUSY';

class RiderCoordinatesDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class UpdateMyRiderStatusDto extends RiderCoordinatesDto {
  @IsIn(['ONLINE', 'OFFLINE'])
  status!: RiderSelfStatus;
}

export class AdminUpdateRiderStatusDto extends RiderCoordinatesDto {
  @IsIn(['ONLINE', 'OFFLINE', 'BUSY'])
  status!: RiderAdminStatus;
}
