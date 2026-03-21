import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TopicSeedService } from '../topic-seed/topic-seed.service';
import { TopicCandidateService } from '../topic-candidate/topic-candidate.service';
import { TopicGenerateAiService } from './topic-generate-ai.service';
import { TOPIC_GENERATE_QUEUE, GENERATE_TOPIC_CANDIDATES_JOB } from './topic-generate.constants';

interface GenerateJobPayload {
  seedId: string;
}

@Processor(TOPIC_GENERATE_QUEUE)
export class TopicGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(TopicGenerateProcessor.name);

  constructor(
    private readonly topicSeedService: TopicSeedService,
    private readonly topicCandidateService: TopicCandidateService,
    private readonly topicGenerateAiService: TopicGenerateAiService,
  ) {
    super();
  }

  async process(job: Job<GenerateJobPayload>): Promise<void> {
    if (job.name !== GENERATE_TOPIC_CANDIDATES_JOB) return;

    const { seedId } = job.data;
    this.logger.log(`Processing generate job for seedId: ${seedId}`);

    const seed = await this.topicSeedService.findOne(seedId);
    const candidates = await this.topicGenerateAiService.generateCandidates(seed.seed);

    await this.topicCandidateService.saveMany(seedId, candidates);
    await this.topicSeedService.incrementUsedCount(seedId);

    this.logger.log(`Generated ${candidates.length} candidates for seedId: ${seedId}`);
  }
}
