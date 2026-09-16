/**
 * Every tag a draft title was ever given, and the only ones stripped.
 *
 * Written out rather than derived from the category enum: no new title is
 * tagged any more, so this is a record of what the stored drafts hold. Deriving
 * it would start stripping a category added later - a word no draft was ever
 * tagged with, and one a model could legitimately open a title with.
 */
const CATEGORY_TAGS: ReadonlySet<string> = new Set([
  'Meaning',
  'Difference',
  'Example',
  'Phrases',
  'Grammar',
]);

/**
 * Whether a string carries any Hangul at all.
 *
 * Readers of this blog search in Korean, so a title without a Korean word in it
 * cannot be found by the people it is written for. "Customer vs Custom: Why ESL
 * Learners Confuse These Words" reached review with 9/10 for SEO title quality
 * and was unreachable by its own audience. English inside a Korean title is
 * normal and wanted - "prefer to do vs prefer doing: 언제 to부정사" is the shape
 * that works - which is why this asks for any Hangul rather than a proportion.
 */
export function containsKorean(text: string): boolean {
  return /[\uAC00-\uD7A3\u3131-\u318E]/.test(text);
}

/**
 * Remove the category tag older drafts carry at the front of their title, and
 * nothing else.
 *
 * Drafts used to be titled "[Meaning] ..." after their seed's category. New ones
 * are not: search shows roughly the first thirty characters of a title, the tag
 * spent a third of them on an English word Korean readers do not search for, and
 * it named the seed rather than the article - "[Meaning] Protect vs Defend vs
 * Guard 차이점". The drafts created before that still hold the tag, so every
 * place a reader sees a title - the post title, the thumbnail overlay, the image
 * alt text - passes it through here.
 *
 * The previous version removed any leading bracket, which is fine until a model
 * writes one of its own - "[비즈니스] 이메일 표현" is a title, not a tag. That one
 * lost its first word in the thumbnail overlay and in the image alt text, both
 * of which a reader sees, and nothing in the pipeline could tell the two cases
 * apart afterwards. A bracket only counts as a tag if it holds a seed category.
 */
export function stripTitleCategory(title: string): string {
  const match = /^\[([^\]]+)\]\s*/.exec(title);
  if (!match || !CATEGORY_TAGS.has(match[1])) return title;
  return title.slice(match[0].length);
}
