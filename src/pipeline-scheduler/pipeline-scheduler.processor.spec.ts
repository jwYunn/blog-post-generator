import { Job } from 'bullmq';
import { AllowedCandidateStatus } from '../topic-candidate/dto/update-topic-candidate-status.dto';
import { EvaluationScope } from '../topic-candidate/enums/evaluation-scope.enum';
import { GENERATE_TOPIC_CANDIDATES_JOB } from '../topic-generate/topic-generate.constants';
import { EVALUATE_TOPIC_CANDIDATES_JOB } from '../topic-evaluate/topic-evaluate.constants';
import { PipelineSchedulerProcessor } from './pipeline-scheduler.processor';
import { POOL_LOW_WATER_MARK } from './pipeline-scheduler.constants';

const CANDIDATE = {
  id: 'candidate-1',
  title: 'Adapt vs Adopt in five minutes',
  overallScore: 8.6,
  topicSeed: { id: 'seed-1', seed: 'adapt vs adopt' },
};

describe('PipelineSchedulerProcessor', () => {
  let schedulerService: any;
  let candidateService: any;
  let seedService: any;
  let generateQueue: any;
  let evaluateQueue: any;
  let job: Job;
  let processor: PipelineSchedulerProcessor;

  function buildJob(data: Record<string, unknown> = {}): Job {
    return {
      data,
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;
  }

  function jobLogText(): string {
    return (job.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
  }

  beforeEach(() => {
    schedulerService = {
      settings: jest.fn(() => ({
        cron: '0 5 * * *',
        timezone: 'Asia/Seoul',
        minScore: 7,
        dailyArticles: 1,
      })),
    };
    candidateService = {
      findBestPending: jest.fn(async () => CANDIDATE),
      updateStatus: jest.fn(async () => ({
        id: CANDIDATE.id,
        status: 'approved',
        articleDraftId: 'draft-1',
        articleDraftCreated: true,
        pipelineQueued: true,
      })),
      // Healthy by default, so top-up only runs where a test asks for it
      countPendingAtOrAbove: jest.fn(async () => POOL_LOW_WATER_MARK + 5),
      findSeedWithUnscoredPending: jest.fn(async () => null),
    };
    seedService = {
      findNextForGeneration: jest.fn(async () => ({
        id: 'seed-2',
        seed: 'along with',
      })),
    };
    generateQueue = { add: jest.fn(async () => ({ id: 11 })) };
    evaluateQueue = { add: jest.fn(async () => ({ id: 22 })) };
    job = buildJob();

    processor = new PipelineSchedulerProcessor(
      schedulerService,
      candidateService,
      seedService,
      generateQueue,
      evaluateQueue,
    );
  });

  describe("starting the day's article", () => {
    it('approves the best candidate, which is what starts the pipeline', async () => {
      await processor.process(job);

      expect(candidateService.findBestPending).toHaveBeenCalledWith(7);
      expect(candidateService.updateStatus).toHaveBeenCalledWith(CANDIDATE.id, {
        status: AllowedCandidateStatus.APPROVED,
      });
    });

    // The run is over long before the article lands, so the log has to carry
    // enough to find it later
    it('records what it picked and where the article went', async () => {
      await processor.process(job);

      expect(jobLogText()).toContain('Adapt vs Adopt in five minutes');
      expect(jobLogText()).toContain('8.6');
      expect(jobLogText()).toContain('adapt vs adopt');
      expect(jobLogText()).toContain('draft-1');
    });

    it('starts as many articles as the settings allow', async () => {
      schedulerService.settings.mockReturnValue({
        cron: '0 5 * * *',
        timezone: 'Asia/Seoul',
        minScore: 7,
        dailyArticles: 3,
      });

      await processor.process(job);

      expect(candidateService.updateStatus).toHaveBeenCalledTimes(3);
    });

    /**
     * Writing nothing is a legitimate outcome - a weak field should not become
     * an article - but the job still succeeds, so it has to say so.
     */
    it('writes nothing and says why when no candidate clears the score', async () => {
      candidateService.findBestPending.mockResolvedValue(null);

      await processor.process(job);

      expect(candidateService.updateStatus).not.toHaveBeenCalled();
      expect(jobLogText()).toContain('no pending candidate scores >= 7');
    });

    it('stops early rather than reaching for a weaker candidate', async () => {
      schedulerService.settings.mockReturnValue({
        cron: '0 5 * * *',
        timezone: 'Asia/Seoul',
        minScore: 7,
        dailyArticles: 3,
      });
      candidateService.findBestPending
        .mockResolvedValueOnce(CANDIDATE)
        .mockResolvedValue(null);

      await processor.process(job);

      expect(candidateService.updateStatus).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Scoring candidates that already exist costs one model call for a whole
   * seed; generating new ones costs that and the generation too. So the backlog
   * is drained first, and generation is the fallback.
   */
  describe('topping the pool up', () => {
    beforeEach(() => {
      candidateService.countPendingAtOrAbove.mockResolvedValue(
        POOL_LOW_WATER_MARK - 1,
      );
    });

    it('leaves the pool alone while it is deep enough', async () => {
      candidateService.countPendingAtOrAbove.mockResolvedValue(
        POOL_LOW_WATER_MARK,
      );

      await processor.process(job);

      expect(evaluateQueue.add).not.toHaveBeenCalled();
      expect(generateQueue.add).not.toHaveBeenCalled();
    });

    it('scores an unscored backlog before generating anything new', async () => {
      candidateService.findSeedWithUnscoredPending.mockResolvedValue('seed-9');

      await processor.process(job);

      expect(evaluateQueue.add).toHaveBeenCalledWith(
        EVALUATE_TOPIC_CANDIDATES_JOB,
        { seedId: 'seed-9', scope: EvaluationScope.PENDING },
      );
      expect(generateQueue.add).not.toHaveBeenCalled();
    });

    it('generates from the next seed once no backlog is left', async () => {
      await processor.process(job);

      expect(generateQueue.add).toHaveBeenCalledWith(
        GENERATE_TOPIC_CANDIDATES_JOB,
        { seedId: 'seed-2' },
      );
      expect(jobLogText()).toContain('queued topic-generate job 11');
    });

    it('says so when the pool is low and there is nothing to draw on', async () => {
      seedService.findNextForGeneration.mockResolvedValue(null);

      await processor.process(job);

      expect(generateQueue.add).not.toHaveBeenCalled();
      expect(jobLogText()).toContain('no active seed to draw on');
    });
  });

  it('separates a manual run from a scheduled one in the log', async () => {
    job = buildJob({ manual: true });

    await processor.process(job);

    expect(jobLogText()).toContain('manual run');
  });

  describe('when the run fails', () => {
    it('records the reason on the job and rethrows', async () => {
      candidateService.updateStatus.mockRejectedValue(
        new Error('candidate vanished'),
      );

      await expect(processor.process(job)).rejects.toThrow(
        'candidate vanished',
      );

      expect(jobLogText()).toContain('FAILED: candidate vanished');
    });
  });
});
