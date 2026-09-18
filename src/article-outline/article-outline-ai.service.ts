import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ArticleOutline } from './article-outline.types';
import { parseJsonResponse } from '../common/utils/ai-json.util';
import {
  buildOutlinePrompt,
  OutlinePromptInput,
} from './article-outline-prompt';

@Injectable()
export class ArticleOutlineAiService {
  private readonly logger = new Logger(ArticleOutlineAiService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async generateOutline(input: OutlinePromptInput): Promise<ArticleOutline> {
    const prompt = buildOutlinePrompt(input);

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

    return parseJsonResponse<ArticleOutline>(
      text,
      'gpt-5 outline generation',
      this.logger,
    );
  }
}
