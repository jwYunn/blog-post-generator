import { Job } from 'bullmq';
import { TopicEvaluateProcessor } from './topic-evaluate.processor';
import { EVALUATE_TOPIC_CANDIDATES_JOB } from './topic-evaluate.constants';

const SEED_ID = 'seed-1';

const CANDIDATES = [
  {
    id: 'c1',
    title: 'Present perfect explained',
    keyword: 'present perfect',
    searchIntent: 'informational',
    targetReader: 'beginners',
    whyThisTopic: 'high volume',
    outlinePreview: ['a'],
  },
  {
    id: 'c2',
    title: 'What ghosting means',
    keyword: 'ghosting',
    searchIntent: 'informational',
    targetReader: 'everyone',
    whyThisTopic: 'trending',
    outlinePreview: null,
  },
];

const EVALUATIONS = [
  { id: 'c2', overallScore: 91, rank: 1, verdict: 'keep' },
  { id: 'c1', overallScore: 64, rank: 2, verdict: 'consider' },
];

describe('TopicEvaluateProcessor', () => {
  let candidateService: any;
  let aiService: any;
  let job: Job;
  let processor: TopicEvaluateProcessor;

  function buildJob(name = EVALUATE_TOPIC_CANDIDATES_JOB): Job {
    return {
      name,
      data: { seedId: SEED_ID, userInput: 'present perfect' },
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;
  }

  function jobLogText(): string {
    return (job.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
  }

  beforeEach(() => {
    candidateService = {
      findBySeedId: jest.fn(async () => CANDIDATES),
      saveEvaluations: jest.fn(),
    };
    aiService = { evaluateCandidates: jest.fn(async () => EVALUATIONS) };
    job = buildJob();

    processor = new TopicEvaluateProcessor(candidateService, aiService);
  });

  it('scores the candidates on the seed and saves the result', async () => {
    await processor.process(job);

    expect(candidateService.findBySeedId).toHaveBeenCalledWith(SEED_ID);
    expect(candidateService.saveEvaluations).toHaveBeenCalledWith(EVALUATIONS);
  });

  // The model is prompted with snake_case keys, so the mapping is part of the
  // contract rather than a detail of the caller
  it('hands the model the candidate fields it expects', async () => {
    await processor.process(job);

    expect(aiService.evaluateCandidates).toHaveBeenCalledWith([
      {
        id: 'c1',
        title: 'Present perfect explained',
        primary_keyword: 'present perfect',
        search_intent: 'informational',
        target_reader: 'beginners',
        why_this_topic: 'high volume',
        outline_preview: ['a'],
      },
      {
        id: 'c2',
        title: 'What ghosting means',
        primary_keyword: 'ghosting',
        search_intent: 'informational',
        target_reader: 'everyone',
        why_this_topic: 'trending',
        outline_preview: null,
      },
    ]);
  });

  // What won and how the field split is the reason anyone opens this job
  describe('what it records', () => {
    it('summarises the verdicts', async () => {
      await processor.process(job);

      expect(jobLogText()).toContain('verdicts - keep:1, consider:1');
    });

    it('names the top pick by title rather than by id', async () => {
      await processor.process(job);

      expect(jobLogText()).toContain('top pick - "What ghosting means"');
      expect(jobLogText()).toContain('score 91');
    });

    it('falls back to the id when the candidate is not in the batch', async () => {
      aiService.evaluateCandidates.mockResolvedValue([
        { id: 'unknown-id', overallScore: 50, rank: 1, verdict: 'drop' },
      ]);

      await processor.process(job);

      expect(jobLogText()).toContain('top pick - "unknown-id"');
    });
  });

  describe('a job it will not act on', () => {
    it('returns without working when the job name is not its own', async () => {
      job = buildJob('generate-topic-candidates');

      await processor.process(job);

      expect(candidateService.findBySeedId).not.toHaveBeenCalled();
      expect(jobLogText()).toContain('skipped - unexpected job name');
    });

    // Evaluating nothing succeeds, which without a line here reads as a run
    // that worked
    it('says why it did nothing when the seed has no candidates', async () => {
      candidateService.findBySeedId.mockResolvedValue([]);

      await processor.process(job);

      expect(aiService.evaluateCandidates).not.toHaveBeenCalled();
      expect(candidateService.saveEvaluations).not.toHaveBeenCalled();
      expect(jobLogText()).toContain('no candidates on seed seed-1');
    });
  });

  it('records the reason on the job and rethrows when the model fails', async () => {
    aiService.evaluateCandidates.mockRejectedValue(
      new Error('gpt-4o returned prose'),
    );

    await expect(processor.process(job)).rejects.toThrow(
      'gpt-4o returned prose',
    );

    expect(jobLogText()).toContain('FAILED: gpt-4o returned prose');
    expect(candidateService.saveEvaluations).not.toHaveBeenCalled();
  });
});
