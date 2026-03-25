import { IsObject, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateApiSourceDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsUrl()
  url: string;

  @IsOptional()
  @IsObject()
  meta?: object;
}
