import { Job } from 'bullmq';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { GENERATE_ARTICLE_CONTENT_JOB } from '../article-content/article-content.constants';
import { ArticleOutlineProcessor } from './article-outline.processor';
import { ArticleOutline } from './article-outline.types';
import { ArticleDepth } from '../topic-candidate/enums/article-depth.enum';

const DRAFT_ID = 'draft-1';

const OUTLINE: ArticleOutline = {
  title: 'Present perfect explained',
  keyword: 'present perfect',
  searchIntent: 'informational',
  sections: ['What it is', 'When to use it', 'Common mistakes'],
  faqs: ['Is it the same as the past simple?'],
};

describe('ArticleOutlineProcessor', () => {
  let draft: any;
  let draftRepository: any;
  let outlineAiService: any;
  let contentQueue: any;
  let job: Job;
  let processor: ArticleOutlineProcessor;

  function buildJob(): Job {
    return {
      data: { articleDraftId: DRAFT_ID },
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;
  }

  beforeEach(() => {
    draft = {
      id: DRAFT_ID,
      title: '[Grammar] Present perfect explained',
      keyword: 'present perfect',
      outline: null,
      status: ArticleDraftStatus.QUEUED,
      errorMessage: null,
      topicCandidate: {
        searchIntent: 'informational',
        targetReader: 'Korean beginners',
        outlinePreview: ['a', 'b'],
      },
    };
    draftRepository = {
      findOne: jest.fn(async () => draft),
      save: jest.fn(async (entity) => entity),
    };
    outlineAiService = { generateOutline: jest.fn(async () => OUTLINE) };
    contentQueue = { add: jest.fn(async () => ({ id: 77 })) };
    job = buildJob();

    processor = new ArticleOutlineProcessor(
      draftRepository,
      outlineAiService,
      contentQueue,
    );
  });

  it('moves the draft to generating_outline before calling the model', async () => {
    let statusWhenCalled: ArticleDraftStatus | undefined;
    outlineAiService.generateOutline.mockImplementation(async () => {
      statusWhenCalled = draft.status;
      return OUTLINE;
    });

    await processor.process(job);

    expect(statusWhenCalled).toBe(ArticleDraftStatus.GENERATING_OUTLINE);
  });

  it('stores the outline and hands the draft on', async () => {
    await processor.process(job);

    expect(draft.outline).toEqual({ ...OUTLINE, depth: ArticleDepth.STANDARD });
    expect(draft.status).toBe(ArticleDraftStatus.OUTLINE_GENERATED);
    expect(draft.errorMessage).toBeNull();
  });

  // The next job's id is what lets one article be followed across queues
  it('queues the content job for the same draft', async () => {
    await processor.process(job);

    expect(contentQueue.add).toHaveBeenCalledWith(
      GENERATE_ARTICLE_CONTENT_JOB,
      { articleDraftId: DRAFT_ID },
    );
  });

  it('passes what the candidate knows to the model', async () => {
    draft.topicCandidate.depth = 'brief';

    await processor.process(job);

    expect(outlineAiService.generateOutline).toHaveBeenCalledWith({
      title: '[Grammar] Present perfect explained',
      keyword: 'present perfect',
      searchIntent: 'informational',
      targetReader: 'Korean beginners',
      outlinePreview: ['a', 'b'],
      depth: ArticleDepth.BRIEF,
    });
  });

  // A draft whose candidate row went missing should still get an outline
  it('falls back to nulls, and standard, when the candidate is gone', async () => {
    draft.topicCandidate = null;

    await processor.process(job);

    expect(outlineAiService.generateOutline).toHaveBeenCalledWith({
      title: '[Grammar] Present perfect explained',
      keyword: 'present perfect',
      searchIntent: null,
      targetReader: null,
      outlinePreview: null,
      depth: ArticleDepth.STANDARD,
    });
  });

  /**
   * Every candidate scored before depth existed has none, and the pool is full
   * of them. They have to come out exactly as they would have.
   */
  describe('depth', () => {
    function jobLogText(): string {
      return (job.log as jest.Mock).mock.calls
        .map((call) => call[0])
        .join('\n');
    }

    it('builds a candidate with no depth as standard, and says it was not set', async () => {
      await processor.process(job);

      expect(outlineAiService.generateOutline).toHaveBeenCalledWith(
        expect.objectContaining({ depth: ArticleDepth.STANDARD }),
      );
      expect(jobLogText()).toContain('depth: standard (not set)');
    });

    // The content stage writes to the length of the outline's depth, so the
    // depth has to travel with the outline it shaped
    it('stores the depth on the outline', async () => {
      draft.topicCandidate.depth = 'brief';
      outlineAiService.generateOutline.mockResolvedValue({
        ...OUTLINE,
        sections: ['What it is', 'When to use it'],
      });

      await processor.process(job);

      expect(draft.outline.depth).toBe(ArticleDepth.BRIEF);
    });

    it('warns when a brief outline comes back with a standard shape', async () => {
      draft.topicCandidate.depth = 'brief';

      await processor.process(job);

      expect(jobLogText()).toContain(
        'WARNING: a brief outline should have 1-2 sections, got 3',
      );
      // Still written: a warning, not a failure
      expect(draft.status).toBe(ArticleDraftStatus.OUTLINE_GENERATED);
    });

    it('says nothing when the outline fits its depth', async () => {
      await processor.process(job);

      expect(jobLogText()).not.toContain('WARNING');
    });
  });

  describe('when the run fails', () => {
    beforeEach(() => {
      outlineAiService.generateOutline.mockRejectedValue(
        new Error('gpt-5 returned nothing usable'),
      );
    });

    it('marks the draft failed and records why', async () => {
      await expect(processor.process(job)).rejects.toThrow(
        'gpt-5 returned nothing usable',
      );

      expect(draft.status).toBe(ArticleDraftStatus.FAILED);
      expect(draft.errorMessage).toBe('gpt-5 returned nothing usable');
    });

    // Queueing the next stage for a draft with no outline would only move the
    // failure one queue along
    it('does not hand the draft on', async () => {
      await expect(processor.process(job)).rejects.toThrow();

      expect(contentQueue.add).not.toHaveBeenCalled();
    });

    it('truncates a long error', async () => {
      outlineAiService.generateOutline.mockRejectedValue(
        new Error('y'.repeat(600)),
      );

      await expect(processor.process(job)).rejects.toThrow();

      expect(draft.errorMessage).toHaveLength(500);
    });
  });

  it('fails when the draft is missing, without calling the model', async () => {
    draftRepository.findOne.mockResolvedValue(null);

    await expect(processor.process(job)).rejects.toThrow(
      /ArticleDraft #draft-1 not found/,
    );
    expect(outlineAiService.generateOutline).not.toHaveBeenCalled();
    expect(draftRepository.save).not.toHaveBeenCalled();
  });
});
