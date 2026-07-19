import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  identifier?: string;

  // Compatibility with existing web/mobile builds.
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(/^(?:\+[1-9]\d{7,14}|\d{10}|91\d{10})$/)
  phoneE164?: string;

  @IsString()
  @MinLength(6)
  password: string = '';
}
