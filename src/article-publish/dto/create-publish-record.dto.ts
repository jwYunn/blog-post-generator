import { IsObject, IsOptional, IsUrl, IsUUID } from 'class-validator';

export class CreatePublishRecordDto {
  @IsUUID()
  draftId: string;

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
