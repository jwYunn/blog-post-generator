import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { TOPIC_GENERATE_PROMPT } from './topic-generate-prompt';
import type { CandidatePayload } from '../topic-candidate/topic-candidate.service';

interface AiCandidateItem {
  title: string;
  primary_keyword: string;
  search_intent: string;
  target_reader: string;
  why_this_topic: string;
  outline_preview: string[];
}

@Injectable()
export class TopicGenerateAiService {
  private readonly logger = new Logger(TopicGenerateAiService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async generateCandidates(seedText: string): Promise<CandidatePayload[]> {
    const prompt = TOPIC_GENERATE_PROMPT.replace('{{USER_INPUT}}', seedText);

    this.logger.log(`Calling Claude for seed: "${seedText}"`);

    const message = await this.anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text : '';

    let items: AiCandidateItem[];
    try {
      // Strip markdown code fences if present
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      items = JSON.parse(clean) as AiCandidateItem[];
    } catch {
      this.logger.error('Failed to parse Claude response. Raw response:');
      this.logger.error(text);
      throw new Error('Invalid JSON response from Claude');
    }

    return items.map((item) => ({
      keyword: item.primary_keyword,
      title: item.title,
      score: 0,
      searchIntent: item.search_intent ?? null,
      targetReader: item.target_reader ?? null,
      whyThisTopic: item.why_this_topic ?? null,
      outlinePreview: Array.isArray(item.outline_preview) ? item.outline_preview : null,
    }));
  }
}
