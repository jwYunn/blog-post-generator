import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TopicSeedCategory } from '../enums/topic-seed-category.enum';

export class CreateTopicSeedDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  seed: string;

  @IsEnum(TopicSeedCategory)
  category: TopicSeedCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number = 5;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}
