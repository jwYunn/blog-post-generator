import { ArticleDepth } from '../../topic-candidate/enums/article-depth.enum';

const DEPTHS: ReadonlySet<string> = new Set(Object.values(ArticleDepth));

/**
 * The depth a model gave, if it gave a usable one.
 *
 * Null rather than a guess, so a stored candidate records whether depth was
 * actually decided. A candidate from before depth existed looks the same, and
 * both are built as standard - see resolveArticleDepth.
 */
export function parseArticleDepth(value: unknown): ArticleDepth | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return DEPTHS.has(normalized) ? (normalized as ArticleDepth) : null;
}

/**
 * The depth to build with. Anything undecided is standard: the shape every
 * article had before depth existed, so the candidates already waiting in the
 * pool come out exactly as they would have.
 */
export function resolveArticleDepth(value: unknown): ArticleDepth {
  return parseArticleDepth(value) ?? ArticleDepth.STANDARD;
}
