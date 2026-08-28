import { TopicSeedCategory } from '../../topic-seed/enums/topic-seed-category.enum';

/** Both halves of the pair have to agree on how a category is capitalised */
function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** Every tag formatTitleWithCategory can produce, and the only ones stripped */
const CATEGORY_TAGS: ReadonlySet<string> = new Set(
  Object.values(TopicSeedCategory).map((category) => categoryLabel(category)),
);

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
