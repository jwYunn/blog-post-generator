import { Job } from 'bullmq';
import { TopicGenerateProcessor } from './topic-generate.processor';
import { GENERATE_TOPIC_CANDIDATES_JOB } from './topic-generate.constants';
import { EVALUATE_TOPIC_CANDIDATES_JOB } from '../topic-evaluate/topic-evaluate.constants';
import { EvaluationScope } from '../topic-candidate/enums/evaluation-scope.enum';

const SEED_ID = 'seed-1';

const CANDIDATES = [
  { keyword: 'present perfect', title: 'Present perfect explained' },
  { keyword: 'ghosting', title: 'What ghosting means' },
];

describe('TopicGenerateProcessor', () => {
  let seedService: any;
  let candidateService: any;
  let aiService: any;
  let evaluateQueue: any;
  let job: Job;
  let processor: TopicGenerateProcessor;

  function buildJob(name = GENERATE_TOPIC_CANDIDATES_JOB): Job {
    return {
      name,
      data: { seedId: SEED_ID },
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;
  }

  function jobLogText(): string {
    return (job.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
  }

  beforeEach(() => {
    seedService = {
      findOne: jest.fn(async () => ({
        id: SEED_ID,
        seed: 'present perfect',
        category: 'grammar',
      })),
      incrementUsedCount: jest.fn(),
    };
    candidateService = {
      saveMany: jest.fn(async () => ({ saved: 2, skipped: 0 })),
    };
    aiService = { generateCandidates: jest.fn(async () => CANDIDATES) };
    evaluateQueue = { add: jest.fn(async () => ({ id: 42 })) };
    job = buildJob();

    processor = new TopicGenerateProcessor(
      seedService,
      candidateService,
      aiService,
      evaluateQueue,
    );
  });

  it('generates candidates from the seed text and saves them', async () => {
    await processor.process(job);

    expect(aiService.generateCandidates).toHaveBeenCalledWith(
      'present perfect',
    );
    expect(candidateService.saveMany).toHaveBeenCalledWith(SEED_ID, CANDIDATES);
  });

  it('counts the seed as used', async () => {
    await processor.process(job);

    expect(seedService.incrementUsedCount).toHaveBeenCalledWith(SEED_ID);
  });

  // Duplicates against the same seed are dropped silently by saveMany, so the
  // split is worth recording rather than leaving someone to query for it
  it('records how many candidates were new', async () => {
    candidateService.saveMany.mockResolvedValue({ saved: 1, skipped: 4 });

    await processor.process(job);

    expect(jobLogText()).toContain('saved 1, skipped 4');
  });

  /**
   * Scoring the candidates is always wanted and has no decision behind it, so
   * generation queues it rather than waiting for a second button.
   */
  describe('chaining into the evaluation', () => {
    it('queues the evaluation once the candidates are saved', async () => {
      await processor.process(job);

      expect(evaluateQueue.add).toHaveBeenCalledWith(
        EVALUATE_TOPIC_CANDIDATES_JOB,
        { seedId: SEED_ID, scope: EvaluationScope.PENDING },
      );
    });

    // Following one seed across queues means knowing where it went next
    it('records the id of the job it queued', async () => {
      await processor.process(job);

      expect(jobLogText()).toContain('queued topic-evaluate job 42');
    });

    /**
     * Scoring is driven by what is pending rather than by what this run saved,
     * so chaining unconditionally is also how candidates left unscored by an
     * earlier failed evaluation get picked up.
     */
    it('queues the evaluation even when every candidate was a duplicate', async () => {
      candidateService.saveMany.mockResolvedValue({ saved: 0, skipped: 10 });

      await processor.process(job);

      expect(evaluateQueue.add).toHaveBeenCalled();
    });

    it('queues nothing when the run failed', async () => {
      candidateService.saveMany.mockRejectedValue(new Error('insert failed'));

      await expect(processor.process(job)).rejects.toThrow();

      expect(evaluateQueue.add).not.toHaveBeenCalled();
    });
  });

  /**
   * A processor that returns early still completes, so the job looks like it
   * ran. These two say why nothing happened.
   */
  describe('a job it will not act on', () => {
    it('returns without working when the job name is not its own', async () => {
      job = buildJob('some-other-job');

      await processor.process(job);

      expect(seedService.findOne).not.toHaveBeenCalled();
      expect(aiService.generateCandidates).not.toHaveBeenCalled();
      expect(jobLogText()).toContain('skipped - unexpected job name');
    });

    it('names the job it was handed', async () => {
      job = buildJob('evaluate-topic-candidates');

      await processor.process(job);

      expect(jobLogText()).toContain('"evaluate-topic-candidates"');
    });
  });

  describe('when the run fails', () => {
    it('records the reason on the job and rethrows', async () => {
      aiService.generateCandidates.mockRejectedValue(
        new Error('claude returned nothing usable'),
      );

      await expect(processor.process(job)).rejects.toThrow(
        'claude returned nothing usable',
      );

      expect(jobLogText()).toContain('FAILED: claude returned nothing usable');
    });

    it('does not count the seed as used', async () => {
      candidateService.saveMany.mockRejectedValue(new Error('insert failed'));

      await expect(processor.process(job)).rejects.toThrow();

      expect(seedService.incrementUsedCount).not.toHaveBeenCalled();
    });

    it('fails when the seed is gone', async () => {
      seedService.findOne.mockRejectedValue(new Error('TopicSeed not found'));

      await expect(processor.process(job)).rejects.toThrow(
        'TopicSeed not found',
      );
      expect(aiService.generateCandidates).not.toHaveBeenCalled();
    });
  });
});
