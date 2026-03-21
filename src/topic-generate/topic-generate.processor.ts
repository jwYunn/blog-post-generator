import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { TopicSeedService } from '../topic-seed/topic-seed.service';
import { TopicCandidateService } from '../topic-candidate/topic-candidate.service';
import { TopicGenerateAiService } from './topic-generate-ai.service';
import { TOPIC_GENERATE_QUEUE, GENERATE_TOPIC_CANDIDATES_JOB } from './topic-generate.constants';
import {
  TOPIC_EVALUATE_QUEUE,
  EVALUATE_TOPIC_CANDIDATES_JOB,
} from '../topic-evaluate/topic-evaluate.constants';

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
    @InjectQueue(TOPIC_EVALUATE_QUEUE)
    private readonly topicEvaluateQueue: Queue,
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

    // Enqueue evaluation job (decoupled — generation does not contain evaluation logic)
    await this.topicEvaluateQueue.add(EVALUATE_TOPIC_CANDIDATES_JOB, {
      seedId,
      userInput: seed.seed,
    });
    this.logger.log(`Enqueued evaluation job for seedId: ${seedId}`);
  }
}
