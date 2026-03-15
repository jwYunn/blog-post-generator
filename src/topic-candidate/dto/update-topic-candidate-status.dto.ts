import { IsEnum } from 'class-validator';

export enum AllowedCandidateStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class UpdateTopicCandidateStatusDto {
  @IsEnum(AllowedCandidateStatus)
  status: AllowedCandidateStatus;
}
