import { TopicSeedCategory } from '../../topic-seed/enums/topic-seed-category.enum';

/** Both halves of the pair have to agree on how a category is capitalised */
function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** Every tag formatTitleWithCategory can produce, and the only ones stripped */
const CATEGORY_TAGS: ReadonlySet<string> = new Set(
  Object.values(TopicSeedCategory).map((category) => categoryLabel(category)),
);

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

export function formatTitleWithCategory(
  category: string,
  title: string,
): string {
  return `[${categoryLabel(category)}] ${title}`;
}

/**
 * Remove the tag formatTitleWithCategory added, and nothing else.
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
