import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestEmailSignupOtpDto {
  @IsEmail()
  @MaxLength(254)
  email: string = '';
}

export class VerifyEmailSignupOtpDto extends RequestEmailSignupOtpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string = '';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string = '';

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string = '';

  @IsString()
  confirmPassword: string = '';
}
