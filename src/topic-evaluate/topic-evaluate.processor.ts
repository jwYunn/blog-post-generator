import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TopicCandidateService } from '../topic-candidate/topic-candidate.service';
import { TopicEvaluateAiService } from './topic-evaluate-ai.service';
import {
  TOPIC_EVALUATE_QUEUE,
  EVALUATE_TOPIC_CANDIDATES_JOB,
} from './topic-evaluate.constants';
import { jobFailed, jobLog, jobStep } from '../common/queue/job-log.util';
import { EvaluationScope } from '../topic-candidate/enums/evaluation-scope.enum';

interface EvaluateJobPayload {
  seedId: string;
  /** Absent on jobs queued before scoping existed; those score pending only */
  scope?: EvaluationScope;
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
    if (job.name !== EVALUATE_TOPIC_CANDIDATES_JOB) {
      // Returning here completes the job, so say why it did nothing
      await jobStep(job, 100, `skipped - unexpected job name "${job.name}"`);
      return;
    }

    const { seedId, scope = EvaluationScope.PENDING } = job.data;
    this.logger.log(`Processing evaluation job for seedId: ${seedId}`);

    try {
      const candidates = await this.topicCandidateService.findBySeedId(
        seedId,
        scope,
      );
      if (candidates.length === 0) {
        this.logger.warn(
          `No candidates found for seedId: ${seedId}, skipping evaluation`,
        );
        // A no-op that still succeeds; without this the job looks like it worked
        await jobStep(
          job,
          100,
          `no ${scope} candidates on seed ${seedId} - nothing to do`,
        );
        return;
      }
      await jobStep(
        job,
        10,
        `seed ${seedId} - ${candidates.length} ${scope} candidates to score`,
      );

      const candidateInputs = candidates.map((c) => ({
        id: c.id,
        title: c.title,
        primary_keyword: c.keyword,
        search_intent: c.searchIntent,
        target_reader: c.targetReader,
        why_this_topic: c.whyThisTopic,
        outline_preview: c.outlinePreview,
      }));

      await jobStep(job, 20, 'calling gpt-4o to score candidates');
      const evaluations =
        await this.topicEvaluateAiService.evaluateCandidates(candidateInputs);
      await jobStep(job, 80, `model scored ${evaluations.length} candidates`);

      // The reason anyone opens this job is to see what won and how the field
      // split, so record both rather than making them query for it.
      const verdicts = evaluations.reduce<Record<string, number>>((acc, e) => {
        acc[e.verdict] = (acc[e.verdict] ?? 0) + 1;
        return acc;
      }, {});
      await jobLog(
        job,
        `verdicts - ${Object.entries(verdicts)
          .map(([verdict, count]) => `${verdict}:${count}`)
          .join(', ')}`,
      );

      const top = [...evaluations].sort((a, b) => a.rank - b.rank)[0];
      if (top) {
        const title = candidates.find((c) => c.id === top.id)?.title ?? top.id;
        await jobLog(job, `top pick - "${title}" (score ${top.overallScore})`);
      }

      await this.topicCandidateService.saveEvaluations(evaluations);
      await jobStep(
        job,
        100,
        `done - ${evaluations.length} candidates updated`,
      );

      this.logger.log(
        `Saved evaluations for ${evaluations.length} candidates (seedId: ${seedId})`,
      );
    } catch (error) {
      await jobFailed(job, error);
      throw error;
    }
  }
}
