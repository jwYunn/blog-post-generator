import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { TopicCandidateService } from '../topic-candidate/topic-candidate.service';
import { TopicSeedService } from '../topic-seed/topic-seed.service';
import { AllowedCandidateStatus } from '../topic-candidate/dto/update-topic-candidate-status.dto';
import { EvaluationScope } from '../topic-candidate/enums/evaluation-scope.enum';
import {
  TOPIC_GENERATE_QUEUE,
  GENERATE_TOPIC_CANDIDATES_JOB,
} from '../topic-generate/topic-generate.constants';
import {
  TOPIC_EVALUATE_QUEUE,
  EVALUATE_TOPIC_CANDIDATES_JOB,
} from '../topic-evaluate/topic-evaluate.constants';
import { jobFailed, jobLog, jobStep } from '../common/queue/job-log.util';
import { PipelineSchedulerService } from './pipeline-scheduler.service';
import {
  PIPELINE_SCHEDULER_QUEUE,
  POOL_LOW_WATER_MARK,
} from './pipeline-scheduler.constants';

interface DailyRunPayload {
  /** Set when a person triggered the run instead of the schedule */
  manual?: boolean;
}

/**
 * One run a day: take the best candidate already sitting in the pool and let
 * the article pipeline write it up, then top the pool up if it is running thin.
 *
 * Drawing from the pool rather than generating fresh candidates on every run is
 * deliberate. Generation returns ten candidates and a run consumes one, so
 * generating daily would grow the backlog by nine a day - which is how the 97
 * unscored candidates already in the table came to be there.
 */
@Processor(PIPELINE_SCHEDULER_QUEUE, { concurrency: 1 })
export class PipelineSchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineSchedulerProcessor.name);

  constructor(
    private readonly schedulerService: PipelineSchedulerService,
    private readonly topicCandidateService: TopicCandidateService,
    private readonly topicSeedService: TopicSeedService,
    @InjectQueue(TOPIC_GENERATE_QUEUE)
    private readonly topicGenerateQueue: Queue,
    @InjectQueue(TOPIC_EVALUATE_QUEUE)
    private readonly topicEvaluateQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<DailyRunPayload>): Promise<void> {
    const { minScore, dailyArticles } = this.schedulerService.settings();
    this.logger.log(`Daily pipeline run (min score ${minScore})`);

    try {
      await jobStep(
        job,
        5,
        `${job.data?.manual ? 'manual' : 'scheduled'} run - up to ` +
          `${dailyArticles} article(s), candidates must score >= ${minScore}`,
      );

      const started = await this.startArticles(job, minScore, dailyArticles);
      await jobStep(job, 60, `started ${started} article(s)`);

      await this.topUpPool(job, minScore);

      await jobStep(job, 100, `done - ${started} article(s) on their way`);
    } catch (error) {
      await jobFailed(job, error);
      throw error;
    }
  }

  /**
   * Approves the best candidates in turn. Approval is what creates the draft and
   * queues the outline, so the article writes itself from here; this run is
   * finished long before it lands.
   */
  private async startArticles(
    job: Job,
    minScore: number,
    dailyArticles: number,
  ): Promise<number> {
    let started = 0;

    for (let i = 0; i < dailyArticles; i++) {
      const candidate =
        await this.topicCandidateService.findBestPending(minScore);

      if (!candidate) {
        // A run that publishes nothing still succeeds, so say what stopped it
        await jobLog(
          job,
          `no pending candidate scores >= ${minScore} - nothing written today`,
        );
        break;
      }

      const result = await this.topicCandidateService.updateStatus(
        candidate.id,
        { status: AllowedCandidateStatus.APPROVED },
      );

      await jobLog(
        job,
        `picked "${candidate.title}" (score ${candidate.overallScore}, ` +
          `seed "${candidate.topicSeed?.seed}") -> draft ` +
          `${'articleDraftId' in result ? result.articleDraftId : 'n/a'}`,
      );
      started += 1;
    }

    return started;
  }

  /**
   * Refills the pool when it thins out, cheapest route first: scoring
   * candidates that already exist costs one model call for a whole seed, while
   * generating new ones costs that plus the generation itself.
   */
  private async topUpPool(job: Job, minScore: number): Promise<void> {
    const remaining =
      await this.topicCandidateService.countPendingAtOrAbove(minScore);

    await jobStep(
      job,
      80,
      `pool holds ${remaining} candidate(s) at >= ${minScore}`,
    );

    if (remaining >= POOL_LOW_WATER_MARK) return;

    const unscoredSeedId =
      await this.topicCandidateService.findSeedWithUnscoredPending();

    if (unscoredSeedId) {
      const next = await this.topicEvaluateQueue.add(
        EVALUATE_TOPIC_CANDIDATES_JOB,
        { seedId: unscoredSeedId, scope: EvaluationScope.PENDING },
      );
      await jobLog(
        job,
        `pool below ${POOL_LOW_WATER_MARK} - scoring the backlog on seed ` +
          `${unscoredSeedId}, queued topic-evaluate job ${next.id}`,
      );
      return;
    }

    const seed = await this.topicSeedService.findNextForGeneration();
    if (!seed) {
      await jobLog(
        job,
        `pool below ${POOL_LOW_WATER_MARK} and no active seed to draw on`,
      );
      return;
    }

    const next = await this.topicGenerateQueue.add(
      GENERATE_TOPIC_CANDIDATES_JOB,
      { seedId: seed.id },
    );
    await jobLog(
      job,
      `pool below ${POOL_LOW_WATER_MARK} - generating from seed "${seed.seed}", ` +
        `queued topic-generate job ${next.id}`,
    );
  }
}
