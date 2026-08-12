import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  email: string = '';
}

export class ConfirmPasswordResetDto {
  @IsEmail()
  email: string = '';

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string = '';

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string = '';

  @IsString()
  confirmPassword: string = '';
}
