import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { parseJsonArrayResponse } from '../common/utils/ai-json.util';
import {
  buildContentPrompt,
  buildHashtagsPrompt,
  GenerateContentInput,
  GenerateHashtagsInput,
} from './article-content-prompt';

@Injectable()
export class ArticleContentAiService {
  private readonly logger = new Logger(ArticleContentAiService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async generateContent(input: GenerateContentInput): Promise<string> {
    const prompt = buildContentPrompt(input);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-5',
      // Sonnet 5 tokenizes the same Korean into ~30% more tokens than Sonnet 4.6
      // did, and its thinking is drawn from this same budget
      max_tokens: 20000,
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
    const prompt = buildHashtagsPrompt(input);

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    const hashtags = parseJsonArrayResponse<string>(
      raw,
      'claude-haiku-4-5 hashtag generation',
      this.logger,
    );

    // The prompt asks for exactly ten; the slice is what holds it to that
    return hashtags.slice(0, 10);
  }
}
