import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ArticleOutline } from '../article-outline/article-outline.types';

export interface GenerateContentInput {
  title: string;
  keyword: string;
  outline: ArticleOutline;
}

@Injectable()
export class ArticleContentAiService {
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async generateContent(input: GenerateContentInput): Promise<string> {
    const { title, keyword, outline } = input;

    const prompt = `
You are an expert English-learning blog writer.

Write a blog article based on the following outline.

Requirements:
- Audience: Korean learners studying English
- Tone: friendly and educational
- Language: Korean explanations + English examples
- Use markdown format
- Do NOT use blockquote syntax (>). Never start a line with >
- Instead of blockquotes, use plain bullet lists (-). Each item on its own bullet line
- Include clear explanations
- Include example sentences
- Avoid repeating phrases
- Keep SEO in mind

Title:
${title}

Keyword:
${keyword}

Sections:
${outline.sections.map((s) => `- ${s}`).join('\n')}

FAQ:
${outline.faqs.map((f) => `- ${f}`).join('\n')}

Structure rules:
- Start with an introduction
- Each section should have explanation + examples
- End with a short summary
`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = response.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    if (!text) {
      throw new Error('Empty response from model');
    }

    return text;
  }
}
