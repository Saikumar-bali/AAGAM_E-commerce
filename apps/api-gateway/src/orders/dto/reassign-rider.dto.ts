import { IsString } from 'class-validator';

export class ReassignRiderDto {
  @IsString()
  userId!: string;
}
