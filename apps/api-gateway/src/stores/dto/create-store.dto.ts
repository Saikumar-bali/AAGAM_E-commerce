import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string = '';

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address: string = '';

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number = 0;

  @IsEmail()
  @MaxLength(254)
  ownerEmail: string = '';
}
