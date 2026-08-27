import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from 'class-validator';
import { ArticlePublishRecordStatus } from '../enums/article-publish-record-status.enum';

export class CreatePublishRecordDto {
  @IsUUID()
  draftId: string;

  /** Defaults to "published": a record entered by hand documents a post that exists */
  @IsOptional()
  @IsEnum(ArticlePublishRecordStatus)
  status?: ArticlePublishRecordStatus;

  @IsOptional()
  @IsString()
  blogName?: string | null;

  @IsOptional()
  @IsUrl()
  permalink?: string | null;

  @IsOptional()
  @IsObject()
  schedule?: { mode: 'now' } | { mode: 'schedule'; scheduledAt: string } | null;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown> | null;
}
