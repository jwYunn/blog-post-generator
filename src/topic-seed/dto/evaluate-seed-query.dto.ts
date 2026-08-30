import { IsEnum, IsOptional } from 'class-validator';
import { EvaluationScope } from '../../topic-candidate/enums/evaluation-scope.enum';

export class EvaluateSeedQueryDto {
  /**
   * Defaults to `pending`. Pass `all` to re-score candidates that have already
   * been approved or rejected, which is worth doing after the rubric changes
   * and wasteful otherwise.
   */
  @IsOptional()
  @IsEnum(EvaluationScope)
  scope?: EvaluationScope;
}
