import { ArticleDepth } from '../topic-candidate/enums/article-depth.enum';

export interface OutlineShape {
  /** What the prompt asks for, and what an outline is checked against afterwards */
  sections: { min: number; max: number };
  sectionRule: string;
  faqRule: string;
  sizeRule: string;
}

/**
 * The structure each depth asks the outline for. The rules are the prompt's own
 * lines, kept next to the section range they describe so the two cannot drift
 * apart. Standard is word for word what every outline was asked for before
 * depth existed.
 */
export const OUTLINE_SHAPES: Record<ArticleDepth, OutlineShape> = {
  [ArticleDepth.BRIEF]: {
    sections: { min: 1, max: 2 },
    sectionRule:
      '1 or 2 main sections - the topic has one core point, so do not split it to fill space',
    faqRule:
      'Include at most 1 FAQ suggestion, and none unless it adds real search value',
    sizeRule:
      'The outline is for a short blog post answering one focused question, so keep it tight',
  },
  [ArticleDepth.STANDARD]: {
    sections: { min: 3, max: 3 },
    sectionRule: 'Exactly 3 main sections',
    faqRule: 'Include 1 or 2 FAQ suggestions only',
    sizeRule:
      'The outline is for a short-to-medium blog post, so keep it compact and focused',
  },
};

export interface OutlinePromptInput {
  title: string;
  keyword: string;
  searchIntent: string | null;
  targetReader: string | null;
  outlinePreview: string[] | null;
  depth: ArticleDepth;
}

/** Built apart from the call so the rules each depth sends can be checked */
export function buildOutlinePrompt(input: OutlinePromptInput): string {
  const { title, keyword, searchIntent, targetReader, outlinePreview, depth } =
    input;
  const shape = OUTLINE_SHAPES[depth];

  const outlinePreviewBlock =
    outlinePreview && outlinePreview.length > 0
      ? `Outline Preview (reference points from candidate generation):\n${outlinePreview.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`
      : '';

  return `
You are an expert SEO content planner.

Create a concise blog article outline for an English-learning blog.

Input:
Title: ${title}
Keyword: ${keyword}
Search Intent: ${searchIntent ?? 'informational'}
Target Reader: ${targetReader ?? 'intermediate'}
${outlinePreviewBlock}

Audience:
Korean learners studying English.

Requirements:
- Use the search intent and target reader level to calibrate depth and tone
- If an outline preview is provided, use it as a reference — expand and improve it, do not copy verbatim
- Prioritize clarity, usefulness, and skimmability over completeness
- Structure should be SEO-friendly, but avoid overly broad or textbook-like coverage
- ${shape.sectionRule}
- Each section title should be narrow and practical, not broad or academic
- Avoid overlapping section topics
- Include common mistakes only if truly useful; otherwise skip it
- ${shape.faqRule}
- Write all output fields in Korean
- Keep English vocabulary being explained and SEO/technical terms in English as-is
- ${shape.sizeRule}
- Avoid section titles that would require long historical background, deep theory, or exhaustive lists
- FAQ must not repeat or paraphrase the main section topics
- Each FAQ should cover a distinct follow-up question not already addressed by a section heading
- Skip any FAQ that overlaps with an existing section
- FAQ should add new search value, not restate the body content
- Focus on clear explanation with only a small number of high-value examples
- Include one practical usage/examples section
- Do not design the outline around large example lists
- Examples should support understanding, not dominate the article

Return JSON ONLY.

Schema:
{
  "title": string,
  "keyword": string,
  "searchIntent": string,
  "sections": string[],
  "faqs": string[]
}
`;
}
