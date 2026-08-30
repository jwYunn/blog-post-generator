/**
 * Which candidates an evaluation run should score.
 *
 * PENDING is the default everywhere. Approved and rejected candidates have
 * already been decided, and re-scoring them overwrites the numbers that
 * decision was made on - a published article's source candidate could come back
 * ranked last, or marked "drop". It also costs a model call per candidate on
 * every run, so scoring the whole seed grew more expensive the longer the seed
 * had been in use. Neither mattered much while evaluation was triggered by
 * hand; both do now that generation chains into it.
 */
export enum EvaluationScope {
  /** Candidates still awaiting a decision */
  PENDING = 'pending',
  /** Everything on the seed - for re-scoring after the rubric changes */
  ALL = 'all',
}
