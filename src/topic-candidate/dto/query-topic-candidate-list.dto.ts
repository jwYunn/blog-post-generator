import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TopicCandidateStatus } from '../enums/topic-candidate-status.enum';

export enum CandidateSortBy {
  CREATED_AT = 'createdAt',
  SCORE = 'score',
  TITLE = 'title',
  OVERALL_SCORE = 'overallScore',
  RANK = 'rank',
}

export enum CandidateSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryTopicCandidateListDto {
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
  @IsUUID()
  topicSeedId?: string;

  @IsOptional()
  @IsEnum(TopicCandidateStatus)
  status?: TopicCandidateStatus;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxScore?: number;

  @IsOptional()
  @IsEnum(CandidateSortBy)
  sortBy?: CandidateSortBy = CandidateSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(CandidateSortOrder)
  sortOrder?: CandidateSortOrder = CandidateSortOrder.DESC;
}
