/**
 * How much an article has to say to satisfy the search behind it.
 *
 * Not the reader's level: a beginner topic can need three sections and an
 * advanced one can be answered in one. Decided when the candidate is generated,
 * it sets the outline's shape, and the outline's shape sets the article's
 * length.
 */
export enum ArticleDepth {
  /** One expression, one core point - "수고하셨습니다 영어로" */
  BRIEF = 'brief',
  /** Several meanings, or two expressions compared - the shape every article had before depth existed */
  STANDARD = 'standard',
}
