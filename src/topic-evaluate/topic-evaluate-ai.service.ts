import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { TOPIC_EVALUATE_PROMPT } from './topic-evaluate-prompt';
import type { EvaluationPayload } from '../topic-candidate/topic-candidate.service';
import { parseJsonArrayResponse } from '../common/utils/ai-json.util';

interface CandidateInput {
  id: string;
  title: string;
  primary_keyword: string;
  search_intent: string | null;
  target_reader: string | null;
  why_this_topic: string | null;
  outline_preview: string[] | null;
}

interface EvaluationDetail extends Record<string, number> {
  search_intent_clarity: number;
  topic_specificity: number;
  seo_title_quality: number;
  practical_value: number;
  outline_feasibility: number;
  uniqueness: number;
}

interface RawEvaluationItem {
  id: string;
  title: string;
  primary_keyword: string;
  overall_score: number;
  rank: number;
  evaluation: EvaluationDetail;
  strengths: string[];
  weaknesses: string[];
  verdict: 'keep' | 'consider' | 'drop';
}

@Injectable()
export class TopicEvaluateAiService {
  private readonly logger = new Logger(TopicEvaluateAiService.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async evaluateCandidates(
    candidates: CandidateInput[],
  ): Promise<EvaluationPayload[]> {
    const prompt = TOPIC_EVALUATE_PROMPT.replace(
      '{{CANDIDATES}}',
      JSON.stringify(candidates, null, 2),
    );

    this.logger.log(`Calling GPT to evaluate ${candidates.length} candidates`);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
    });

    const text = response.choices[0]?.message?.content ?? '';

    const items = parseJsonArrayResponse<RawEvaluationItem>(
      text,
      'gpt-4o candidate evaluation',
      this.logger,
    );

    return items.map((item) => ({
      id: item.id,
      overallScore: item.overall_score ?? 0,
      rank: item.rank ?? 0,
      strengths: Array.isArray(item.strengths) ? item.strengths : [],
      weaknesses: Array.isArray(item.weaknesses) ? item.weaknesses : [],
      verdict: item.verdict ?? 'consider',
      evaluationDetail: item.evaluation ?? null,
    }));
  }
}
