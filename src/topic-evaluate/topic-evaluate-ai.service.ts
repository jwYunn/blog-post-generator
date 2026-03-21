import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { TOPIC_EVALUATE_PROMPT } from './topic-evaluate-prompt';
import type { EvaluationPayload } from '../topic-candidate/topic-candidate.service';

interface CandidateInput {
  id: string;
  title: string;
  primary_keyword: string;
  search_intent: string | null;
  target_reader: string | null;
  outline_preview: string[] | null;
}

interface RawEvaluationItem {
  id: string;
  overall_score: number;
  rank: number;
  strengths: string[];
  weaknesses: string[];
  verdict: string;
}

@Injectable()
export class TopicEvaluateAiService {
  private readonly logger = new Logger(TopicEvaluateAiService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  async evaluateCandidates(
    userInput: string,
    candidates: CandidateInput[],
  ): Promise<EvaluationPayload[]> {
    const prompt = TOPIC_EVALUATE_PROMPT
      .replace('{{USER_INPUT}}', userInput)
      .replace('{{CANDIDATES}}', JSON.stringify(candidates, null, 2));

    this.logger.log(`Calling Claude to evaluate ${candidates.length} candidates for: "${userInput}"`);

    const message = await this.anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text : '';

    let items: RawEvaluationItem[];
    try {
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      items = JSON.parse(clean) as RawEvaluationItem[];
    } catch {
      this.logger.error('Failed to parse Claude evaluation response. Raw response:');
      this.logger.error(text);
      throw new Error('Invalid JSON response from Claude evaluation');
    }

    if (!Array.isArray(items)) {
      throw new Error('Claude evaluation did not return an array');
    }

    return items.map((item) => ({
      id: item.id,
      overallScore: item.overall_score ?? 0,
      rank: item.rank ?? 0,
      strengths: Array.isArray(item.strengths) ? item.strengths : [],
      weaknesses: Array.isArray(item.weaknesses) ? item.weaknesses : [],
      verdict: item.verdict ?? '',
    }));
  }
}
