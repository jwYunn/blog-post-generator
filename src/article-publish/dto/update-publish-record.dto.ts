import { IsEnum, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';
import { ArticlePublishRecordStatus } from '../enums/article-publish-record-status.enum';

export class UpdatePublishRecordDto {
  /**
   * How an attempt that never reported back gets resolved: someone checks the
   * blog and sets this to "failed" if no post is there, which lets the draft be
   * published again. Deleting the record does the same thing.
   */
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
