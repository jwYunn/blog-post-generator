import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ArticleOutline } from '../article-outline/article-outline.types';

export interface GenerateContentInput {
  title: string;
  keyword: string;
  outline: ArticleOutline;
}

export interface GenerateHashtagsInput {
  title: string;
  keyword: string;
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
- Do NOT include the title at the top of the article. Start directly with the introduction body text
- Each section should have explanation + examples
- End with a short summary
- Do NOT include a "관련 글 추천" or related articles section at the end
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

  async generateHashtags(input: GenerateHashtagsInput): Promise<string[]> {
    const { title, keyword } = input;

    const prompt = `Generate exactly 10 SEO-friendly hashtags for a Korean English-learning blog post.

Title: ${title}
Keyword: ${keyword}

Rules:
- Each hashtag must start with #
- Mix Korean and English hashtags (roughly half each)
- Focus on SEO value: include the main keyword, related topics, and search terms Korean learners would use
- No spaces within a hashtag
- Return ONLY a JSON array of strings, no explanation

Example format: ["#영어공부", "#EnglishGrammar", "#영어표현", "#LearnEnglish", ...]`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    // JSON 배열 파싱
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error('Failed to parse hashtags response');
    }

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) {
      throw new Error('Hashtags response is not an array');
    }

    return (parsed as string[]).slice(0, 10);
  }
}
