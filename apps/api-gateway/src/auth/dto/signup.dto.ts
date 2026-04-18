import { IsEmail, IsString, IsEnum, IsOptional, MinLength } from 'class-validator';
import { Role } from '@aagam/database';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
