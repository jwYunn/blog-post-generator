import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ArticleOutline } from './article-outline.types';

@Injectable()
export class ArticleOutlineAiService {
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async generateOutline(
    title: string,
    keyword: string,
    searchIntent: string | null,
    targetReader: string | null,
    outlinePreview: string[] | null,
  ): Promise<ArticleOutline> {
    const outlinePreviewBlock =
      outlinePreview && outlinePreview.length > 0
        ? `Outline Preview (reference points from candidate generation):\n${outlinePreview.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`
        : '';

    const prompt = `
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
- Exactly 3 main sections
- Each section title should be narrow and practical, not broad or academic
- Avoid overlapping section topics
- Include common mistakes only if truly useful; otherwise skip it
- Include 1 or 2 FAQ suggestions only
- Write all output fields in Korean
- Keep English vocabulary being explained and SEO/technical terms in English as-is
- The outline is for a short-to-medium blog post, so keep it compact and focused
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

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        {
          role: 'system',
          content: 'You generate structured SEO blog outlines.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = completion.choices[0].message.content ?? '';

    try {
      return JSON.parse(text) as ArticleOutline;
    } catch {
      throw new Error('Invalid JSON from model');
    }
  }
}
