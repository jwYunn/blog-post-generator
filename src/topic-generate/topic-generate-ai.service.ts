import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { TOPIC_GENERATE_PROMPT } from './topic-generate-prompt';
import type { CandidatePayload } from '../topic-candidate/topic-candidate.service';
import { containsKorean } from '../common/utils/title.util';
import { parseArticleDepth } from '../common/utils/article-depth.util';
import { parseJsonArrayResponse } from '../common/utils/ai-json.util';

interface AiCandidateItem {
  title: string;
  primary_keyword: string;
  search_intent: string;
  target_reader: string;
  depth?: string;
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

  /**
   * @returns the usable candidates, and how many were discarded for having no
   * Korean in the title. The prompt asks for Korean and the model mostly obliges,
   * so a non-zero count is worth surfacing rather than silently absorbing: it
   * means the instruction is being ignored, which a run should say out loud.
   */
  async generateCandidates(
    seedText: string,
  ): Promise<{ candidates: CandidatePayload[]; droppedNonKorean: number }> {
    const prompt = TOPIC_GENERATE_PROMPT.replace('{{USER_INPUT}}', seedText);

    this.logger.log(`Calling Claude for seed: "${seedText}"`);

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-5',
      // Thinking is drawn from this budget too, and Sonnet 5's tokenizer makes
      // the same candidate list ~30% longer - 4096 no longer clears a full list
      max_tokens: 12000,
      messages: [{ role: 'user', content: prompt }],
    });

    // Sonnet 5 thinks by default, so the first block is a thinking block, not
    // the JSON - read every text block rather than whichever comes first
    const text = message.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    const items = parseJsonArrayResponse<AiCandidateItem>(
      text,
      'claude-sonnet-5 topic generation',
      this.logger,
    );

    // Dropped here rather than marked down later: a title its readers cannot
    // search is not a weaker candidate, it is an unusable one, and storing it
    // only gives the scheduler something else to rank.
    const usable = items.filter((item) => containsKorean(item.title ?? ''));
    const droppedNonKorean = items.length - usable.length;

    if (droppedNonKorean > 0) {
      this.logger.warn(
        `Dropped ${droppedNonKorean} candidate(s) with no Korean in the title`,
      );
    }

    return {
      droppedNonKorean,
      candidates: usable.map((item) => ({
        keyword: item.primary_keyword,
        title: item.title,
        score: 0,
        searchIntent: item.search_intent ?? null,
        targetReader: item.target_reader ?? null,
        whyThisTopic: item.why_this_topic ?? null,
        outlinePreview: Array.isArray(item.outline_preview)
          ? item.outline_preview
          : null,
        depth: parseArticleDepth(item.depth),
      })),
    };
  }
}
