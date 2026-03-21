import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TopicCandidateService } from '../topic-candidate/topic-candidate.service';
import { TopicEvaluateAiService } from './topic-evaluate-ai.service';
import { TOPIC_EVALUATE_QUEUE, EVALUATE_TOPIC_CANDIDATES_JOB } from './topic-evaluate.constants';

interface EvaluateJobPayload {
  seedId: string;
  userInput: string;
}

@Processor(TOPIC_EVALUATE_QUEUE)
export class TopicEvaluateProcessor extends WorkerHost {
  private readonly logger = new Logger(TopicEvaluateProcessor.name);

  constructor(
    private readonly topicCandidateService: TopicCandidateService,
    private readonly topicEvaluateAiService: TopicEvaluateAiService,
  ) {
    super();
  }

  async process(job: Job<EvaluateJobPayload>): Promise<void> {
    if (job.name !== EVALUATE_TOPIC_CANDIDATES_JOB) return;

    const { seedId, userInput } = job.data;
    this.logger.log(`Processing evaluation job for seedId: ${seedId}`);

    const candidates = await this.topicCandidateService.findBySeedId(seedId);
    if (candidates.length === 0) {
      this.logger.warn(`No candidates found for seedId: ${seedId}, skipping evaluation`);
      return;
    }

    const candidateInputs = candidates.map((c) => ({
      id: c.id,
      title: c.title,
      primary_keyword: c.keyword,
      search_intent: c.searchIntent,
      target_reader: c.targetReader,
      outline_preview: c.outlinePreview,
    }));

    const evaluations = await this.topicEvaluateAiService.evaluateCandidates(
      userInput,
      candidateInputs,
    );

    await this.topicCandidateService.saveEvaluations(evaluations);

    this.logger.log(`Saved evaluations for ${evaluations.length} candidates (seedId: ${seedId})`);
  }
}
