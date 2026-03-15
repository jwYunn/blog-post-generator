import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ArticleDraftStatus } from '../enums/article-draft-status.enum';

export enum DraftSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum DraftSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryArticleDraftListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(ArticleDraftStatus)
  status?: ArticleDraftStatus;

  @IsOptional()
  @IsEnum(DraftSortBy)
  sortBy?: DraftSortBy = DraftSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(DraftSortOrder)
  sortOrder?: DraftSortOrder = DraftSortOrder.DESC;
}
