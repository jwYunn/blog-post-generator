import { ArticleDepth } from '../topic-candidate/enums/article-depth.enum';
import { ArticleOutline } from '../article-outline/article-outline.types';

export interface ContentLength {
  /** Korean characters the prompt aims for */
  min: number;
  max: number;
  /** Stated to the model as a ceiling, and checked against the result */
  hardMax: number;
}

/**
 * How long each depth's article should run. Standard is the range every article
 * was written to before depth existed; brief is roughly half, for a topic whose
 * whole answer fits in one or two sections.
 */
export const CONTENT_LENGTHS: Record<ArticleDepth, ContentLength> = {
  [ArticleDepth.BRIEF]: { min: 800, max: 1200, hardMax: 1500 },
  [ArticleDepth.STANDARD]: { min: 1800, max: 2500, hardMax: 3000 },
};

/** 1800 -> "1,800", the way the prompt has always spelled it */
export function formatCharCount(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface GenerateContentInput {
  title: string;
  keyword: string;
  outline: ArticleOutline;
  depth: ArticleDepth;
}

export interface GenerateHashtagsInput {
  title: string;
  keyword: string;
}

/** Built apart from the call so the length each depth asks for can be checked */
export function buildContentPrompt(input: GenerateContentInput): string {
  const { title, keyword, outline, depth } = input;
  const length = CONTENT_LENGTHS[depth];

  // A brief outline often has no FAQ. An empty "FAQ:" heading invites the model
  // to invent one, so the block goes and the rule says to leave it out.
  const hasFaqs = outline.faqs.length > 0;
  const faqBlock = hasFaqs
    ? `FAQ:\n${outline.faqs.map((f) => `- ${f}`).join('\n')}\n\n`
    : '';
  const faqRule = hasFaqs
    ? 'Add FAQ only if it adds real search value; keep it brief'
    : 'Do not add a FAQ section';

  return `
You are an expert English-learning blog writer.

Write a concise blog article based on the following outline.

Requirements:
- Audience: Korean learners studying English
- Tone: friendly, practical, and educational
- Language: Korean explanations + English examples
- Use markdown format
- Do NOT use blockquote syntax (>). Never start a line with >
- Instead of blockquotes, use plain bullet lists (-). Each item on its own bullet line
- Prioritize clarity and usefulness over completeness
- Keep the article concise and easy to skim
- Target length: ${formatCharCount(length.min)} to ${formatCharCount(length.max)} Korean characters
- Hard maximum: ${formatCharCount(length.hardMax)} Korean characters
- Avoid repetitive explanations or saying the same point in different words
- Avoid textbook-style writing, long background explanations, and unnecessary theory
- Keep SEO in mind, but do not sacrifice readability for SEO
- Use only the most useful examples
- Maximum 2 or 3 example sentences per section
- Keep each section focused and compact
- Do not over-explain obvious points

Title:
${title}

Keyword:
${keyword}

Sections:
${outline.sections.map((s) => `- ${s}`).join('\n')}

${faqBlock}Structure rules:
- Do NOT include the title at the top of the article. Start directly with the introduction body text
- Write a short introduction in 2 to 3 sentences
- Create one markdown heading per section from the outline
- Each section should include a brief explanation and a small number of examples
- If a section can be explained simply, keep it short
- ${faqRule}
- End with a short summary
- Do NOT include a "관련 글 추천" or related articles section at the end
`;
}

export function buildHashtagsPrompt(input: GenerateHashtagsInput): string {
  const { title, keyword } = input;

  return `Generate exactly 10 SEO-friendly hashtags for a Korean English-learning blog post.

Title: ${title}
Keyword: ${keyword}

Rules:
- Each hashtag must start with #
- Mix Korean and English hashtags (roughly half each)
- Focus on SEO value: include the main keyword, related topics, and search terms Korean learners would use
- No spaces within a hashtag
- Return ONLY a JSON array of strings, no explanation

Example format: ["#영어공부", "#EnglishGrammar", "#영어표현", "#LearnEnglish", ...]`;
}
