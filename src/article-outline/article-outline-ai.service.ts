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

Create a blog article outline for an English-learning blog.

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
- Focus on clear explanation and examples
- Structure optimized for SEO
- 3~5 main sections
- Include example usage section (maximum 3)
- Include common mistakes section (maximum 3)
- Include FAQ suggestions (maximum 3)
- Write all output fields in Korean
- Keep English vocabulary being explained and SEO/technical terms in English as-is

Return JSON ONLY.

Schema:
{
  "title": string,
  "keyword": string,
  "searchIntent": string,   // Korean sentence describing user intent
  "sections": string[],     // Korean section titles, keeping target English words
  "faqs": string[]          // Korean questions, keeping target English words. max 5 items
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
