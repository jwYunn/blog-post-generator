import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TopicSeedService } from '../topic-seed/topic-seed.service';
import { TopicCandidateService } from '../topic-candidate/topic-candidate.service';
import { TopicGenerateAiService } from './topic-generate-ai.service';
import {
  TOPIC_GENERATE_QUEUE,
  GENERATE_TOPIC_CANDIDATES_JOB,
} from './topic-generate.constants';
import { jobFailed, jobStep } from '../common/queue/job-log.util';

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
    if (job.name !== GENERATE_TOPIC_CANDIDATES_JOB) {
      // Returning here completes the job, so say why it did nothing
      await jobStep(job, 100, `skipped - unexpected job name "${job.name}"`);
      return;
    }

    const { seedId } = job.data;
    this.logger.log(`Processing generate job for seedId: ${seedId}`);

    try {
      const seed = await this.topicSeedService.findOne(seedId);
      await jobStep(
        job,
        10,
        `seed ${seedId} "${seed.seed}" (category: ${seed.category})`,
      );

      await jobStep(job, 20, 'calling claude-opus-4-5 for candidates');
      const candidates = await this.topicGenerateAiService.generateCandidates(
        seed.seed,
      );
      await jobStep(job, 70, `model returned ${candidates.length} candidates`);

      const { saved, skipped } = await this.topicCandidateService.saveMany(
        seedId,
        candidates,
      );
      await jobStep(
        job,
        90,
        `saved ${saved}, skipped ${skipped} already present on this seed`,
      );

      await this.topicSeedService.incrementUsedCount(seedId);
      await jobStep(job, 100, `done - ${saved} new candidates pending review`);

      this.logger.log(
        `Generated ${candidates.length} candidates for seedId: ${seedId}`,
      );
    } catch (error) {
      await jobFailed(job, error);
      throw error;
    }
  }
}
