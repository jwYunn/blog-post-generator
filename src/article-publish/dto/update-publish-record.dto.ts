import { IsObject, IsOptional, IsUrl } from 'class-validator';

export class UpdatePublishRecordDto {
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
