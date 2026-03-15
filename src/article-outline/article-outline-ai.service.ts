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
  ): Promise<ArticleOutline> {
    const prompt = `
You are an expert SEO content planner.

Create a blog article outline for an English-learning blog.

Input:
Title: ${title}
Keyword: ${keyword}

Audience:
Korean learners studying English.

Requirements:
- Focus on clear explanation and examples
- Structure optimized for SEO
- 3~5 main sections
- Include example usage section (maximum 3)
- Include common mistakes section (maximum 3)
- Include FAQ suggestions (maximum 3)

Return JSON ONLY.

Schema:
{
  "title": string,
  "keyword": string,
  "searchIntent": string,
  "sections": string[],
  "faqs": string[]  // max 5 items
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
