import { IsOptional, IsString, MaxLength, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateThumbnailDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['black-forest-labs/flux-schnell', 'black-forest-labs/flux-dev'])
  model?: string;

  @IsOptional()
  @IsString()
  @IsIn(['1:1', '16:9', '4:3', '3:2', '21:9'])
  aspect_ratio?: string;

  @IsOptional()
  @IsString()
  @IsIn(['webp', 'jpg', 'png'])
  output_format?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  num_outputs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  output_quality?: number;
}
