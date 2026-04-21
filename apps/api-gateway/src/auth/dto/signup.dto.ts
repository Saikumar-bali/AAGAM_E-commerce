import { IsEmail, IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Role } from '@aagam/database';

export class SignupDto {
  @IsEmail()
  email: string = '';

  @IsString()
  @MinLength(8)
  @MaxLength(72) // Bcrypt limit
  password: string = '';

  @IsString()
  name: string = '';

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
