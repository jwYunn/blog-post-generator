/**
 * How much an article has to say to satisfy the search behind it.
 *
 * Not the reader's level: a beginner topic can need three sections and an
 * advanced one can be answered in one. Decided when the candidate is generated,
 * it sets the outline's shape, and the outline's shape sets the article's
 * length.
 */
export enum ArticleDepth {
  /**
   * An answer to use right away - one expression's meaning, or the few ways to
   * say one Korean phrase: "확인 부탁드립니다 영어로"
   */
  BRIEF = 'brief',
  /**
   * The difference is the question, or the meaning shifts with context -
   * "adapt vs adopt 차이". The shape every article had before depth existed
   */
  STANDARD = 'standard',
}
