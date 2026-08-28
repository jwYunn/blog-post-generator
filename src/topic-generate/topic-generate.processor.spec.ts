import { Job } from 'bullmq';
import { TopicGenerateProcessor } from './topic-generate.processor';
import { GENERATE_TOPIC_CANDIDATES_JOB } from './topic-generate.constants';

const SEED_ID = 'seed-1';

const CANDIDATES = [
  { keyword: 'present perfect', title: 'Present perfect explained' },
  { keyword: 'ghosting', title: 'What ghosting means' },
];

describe('TopicGenerateProcessor', () => {
  let seedService: any;
  let candidateService: any;
  let aiService: any;
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
    job = buildJob();

    processor = new TopicGenerateProcessor(
      seedService,
      candidateService,
      aiService,
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
