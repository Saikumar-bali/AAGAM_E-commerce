import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export type RiderSelfStatus = 'ONLINE' | 'OFFLINE';
export type RiderAdminStatus = RiderSelfStatus | 'BUSY';

export class RiderHeartbeatDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

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

  @IsOptional()
  @IsBoolean()
  heartbeat?: boolean;
}

export class AdminUpdateRiderStatusDto extends RiderCoordinatesDto {
  @IsIn(['ONLINE', 'OFFLINE', 'BUSY'])
  status!: RiderAdminStatus;
}
