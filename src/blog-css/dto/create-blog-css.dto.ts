import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBlogCssDto {
  @IsUrl()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  blogUrl: string;

  @IsString()
  @IsNotEmpty()
  css: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
