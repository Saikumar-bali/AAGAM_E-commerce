import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

function normalizeIndianPhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : String(value ?? '').trim();
}

export class UpdateOwnedStoreProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string = '';

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address: string = '';

  @Transform(({ value }) => normalizeIndianPhone(value))
  @IsString()
  @Matches(/^\+91[6-9]\d{9}$/, {
    message: 'Phone number must be a valid Indian mobile number',
  })
  phone: string = '';
}
