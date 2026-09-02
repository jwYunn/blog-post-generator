import { Job } from 'bullmq';
import { TopicEvaluateProcessor } from './topic-evaluate.processor';
import { EVALUATE_TOPIC_CANDIDATES_JOB } from './topic-evaluate.constants';
import { EvaluationScope } from '../topic-candidate/enums/evaluation-scope.enum';

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

  function buildJob(
    name = EVALUATE_TOPIC_CANDIDATES_JOB,
    data: Record<string, unknown> = { seedId: SEED_ID },
  ): Job {
    return {
      name,
      data,
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
      findCoveredTitlesBySeed: jest.fn(async () => []),
      saveEvaluations: jest.fn(),
    };
    aiService = { evaluateCandidates: jest.fn(async () => EVALUATIONS) };
    job = buildJob();

    processor = new TopicEvaluateProcessor(candidateService, aiService);
  });

  it('scores the candidates on the seed and saves the result', async () => {
    await processor.process(job);

    expect(candidateService.findBySeedId).toHaveBeenCalledWith(
      SEED_ID,
      EvaluationScope.PENDING,
    );
    expect(candidateService.saveEvaluations).toHaveBeenCalledWith(EVALUATIONS);
  });

  /**
   * Re-scoring a decided candidate overwrites the numbers its decision was made
   * on, and costs a model call for an answer nobody acts on - so a run scores
   * pending candidates unless it is explicitly asked for more.
   */
  describe('which candidates get scored', () => {
    it('scores only pending candidates by default', async () => {
      await processor.process(job);

      expect(candidateService.findBySeedId).toHaveBeenCalledWith(
        SEED_ID,
        EvaluationScope.PENDING,
      );
    });

    it('re-scores everything when the job asks for it', async () => {
      job = buildJob(EVALUATE_TOPIC_CANDIDATES_JOB, {
        seedId: SEED_ID,
        scope: EvaluationScope.ALL,
      });

      await processor.process(job);

      expect(candidateService.findBySeedId).toHaveBeenCalledWith(
        SEED_ID,
        EvaluationScope.ALL,
      );
    });

    // Jobs queued before scoping existed carry no scope at all
    it('falls back to pending when the job carries no scope', async () => {
      job = buildJob(EVALUATE_TOPIC_CANDIDATES_JOB, { seedId: SEED_ID });

      await processor.process(job);

      expect(candidateService.findBySeedId).toHaveBeenCalledWith(
        SEED_ID,
        EvaluationScope.PENDING,
      );
    });
  });

  /**
   * Judging a candidate only against its siblings lets the same search intent
   * be covered twice, months apart - the two articles then compete for one
   * query instead of adding up. What the seed has already produced goes to the
   * model alongside the candidates.
   */
  describe('scoring against what the seed already covers', () => {
    it('hands the model the articles this seed has produced', async () => {
      candidateService.findCoveredTitlesBySeed.mockResolvedValue([
        'Would vs Could 차이',
        'Sorry와 Apologize 차이',
      ]);

      await processor.process(job);

      expect(candidateService.findCoveredTitlesBySeed).toHaveBeenCalledWith(
        SEED_ID,
      );
      expect(aiService.evaluateCandidates).toHaveBeenCalledWith(
        expect.any(Array),
        ['Would vs Could 차이', 'Sorry와 Apologize 차이'],
      );
    });

    it('passes an empty list for a seed that has produced nothing', async () => {
      await processor.process(job);

      expect(aiService.evaluateCandidates).toHaveBeenCalledWith(
        expect.any(Array),
        [],
      );
    });

    // Worth recording: it explains why a run scored the field the way it did
    it('records how much ground the seed already covers', async () => {
      candidateService.findCoveredTitlesBySeed.mockResolvedValue(['a', 'b']);

      await processor.process(job);

      expect(jobLogText()).toContain('2 article(s) already cover this seed');
    });
  });

  // The model is prompted with snake_case keys, so the mapping is part of the
  // contract rather than a detail of the caller
  it('hands the model the candidate fields it expects', async () => {
    await processor.process(job);

    expect(aiService.evaluateCandidates).toHaveBeenCalledWith(
      [
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
      ],
      // Covered titles ride alongside the candidates; this seed has none
      [],
    );
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
      expect(jobLogText()).toContain('no pending candidates on seed seed-1');
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
