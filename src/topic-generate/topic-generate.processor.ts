import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TopicSeedService } from '../topic-seed/topic-seed.service';
import { TopicSeedEntity } from '../topic-seed/topic-seed.entity';
import { TopicSeedCategory } from '../topic-seed/enums/topic-seed-category.enum';
import { TOPIC_GENERATE_TEMPLATES } from '../topic-seed/constants/topic-generate-templates';
import { TopicCandidateService, CandidatePayload } from '../topic-candidate/topic-candidate.service';
import { TOPIC_GENERATE_QUEUE, GENERATE_TOPIC_CANDIDATES_JOB } from './topic-generate.constants';

interface GenerateJobPayload {
  seedId: string;
}

const BROAD_KEYWORDS = new Set(['english', 'learn english', 'daily english']);

@Processor(TOPIC_GENERATE_QUEUE)
export class TopicGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(TopicGenerateProcessor.name);

  constructor(
    private readonly topicSeedService: TopicSeedService,
    private readonly topicCandidateService: TopicCandidateService,
  ) {
    super();
  }

  async process(job: Job<GenerateJobPayload>): Promise<void> {
    if (job.name !== GENERATE_TOPIC_CANDIDATES_JOB) return;

    const { seedId } = job.data;
    this.logger.log(`Processing generate job for seedId: ${seedId}`);

    const seed = await this.topicSeedService.findOne(seedId);
    const terms = this.parseTerms(seed);
    const templates = TOPIC_GENERATE_TEMPLATES[seed.category];

    const candidates: CandidatePayload[] = templates.map(({ titleTemplate, keywordTemplate }) => {
      const keyword = this.fillTemplate(keywordTemplate, terms);
      const title = this.fillTemplate(titleTemplate, terms);
      const score = this.calculateScore(seed.category, keyword, title);
      return { keyword, title, score };
    });

    await this.topicCandidateService.saveMany(seedId, candidates);
    await this.topicSeedService.incrementUsedCount(seedId);

    this.logger.log(
      `Generated ${candidates.length} candidates for seedId: ${seedId}`,
    );
  }

  private parseTerms(seed: TopicSeedEntity): Record<string, string> {
    const trimmed = seed.seed.trim();

    if (seed.category === TopicSeedCategory.DIFFERENCE) {
      const parts = trimmed.split(/\s+vs\s+/i);
      if (parts.length !== 2) {
        throw new Error(
          `Cannot parse "vs" from difference seed: "${seed.seed}"`,
        );
      }
      return { term1: parts[0].trim(), term2: parts[1].trim() };
    }

    return { term: trimmed };
  }

  private fillTemplate(template: string, terms: Record<string, string>): string {
    return Object.entries(terms).reduce(
      (result, [key, value]) =>
        result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      template,
    );
  }

  private calculateScore(
    category: TopicSeedCategory,
    keyword: string,
    title: string,
  ): number {
    let score = 50;

    const categoryBonus: Record<TopicSeedCategory, number> = {
      [TopicSeedCategory.MEANING]:    20,
      [TopicSeedCategory.DIFFERENCE]: 20,
      [TopicSeedCategory.EXAMPLE]:    15,
      [TopicSeedCategory.PHRASES]:    10,
      [TopicSeedCategory.GRAMMAR]:    10,
    };
    score += categoryBonus[category];

    if (BROAD_KEYWORDS.has(keyword.toLowerCase())) {
      score -= 20;
    } else if (keyword.length > 10) {
      score += 10;
    }

    if (title.length > 15) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }
}
