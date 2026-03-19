import { IsEnum, IsISO8601, IsOptional, ValidateIf } from 'class-validator';

export enum PublishJobMode {
  NOW = 'now',
  SCHEDULE = 'schedule',
}

export class CreatePublishJobDto {
  @IsEnum(PublishJobMode)
  mode: PublishJobMode;

  /** mode === 'schedule' 일 때 필수. ISO 8601 형식 (예: "2026-03-22T14:00:00") */
  @ValidateIf((o) => o.mode === PublishJobMode.SCHEDULE)
  @IsISO8601()
  @IsOptional()
  scheduledAt?: string;
}
