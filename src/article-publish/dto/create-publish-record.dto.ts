import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class ScheduleNowDto {
  @IsIn(['now'])
  mode: 'now';
}

class ScheduleReservedDto {
  @IsIn(['schedule'])
  mode: 'schedule';

  @IsISO8601()
  scheduledAt: string;
}

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
