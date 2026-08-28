import { Job } from 'bullmq';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { GENERATE_ARTICLE_CONTENT_JOB } from '../article-content/article-content.constants';
import { ArticleOutlineProcessor } from './article-outline.processor';
import { ArticleOutline } from './article-outline.types';

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

    expect(draft.outline).toEqual(OUTLINE);
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
    await processor.process(job);

    expect(outlineAiService.generateOutline).toHaveBeenCalledWith(
      '[Grammar] Present perfect explained',
      'present perfect',
      'informational',
      'Korean beginners',
      ['a', 'b'],
    );
  });

  // A draft whose candidate row went missing should still get an outline
  it('falls back to nulls when the candidate is gone', async () => {
    draft.topicCandidate = null;

    await processor.process(job);

    expect(outlineAiService.generateOutline).toHaveBeenCalledWith(
      '[Grammar] Present perfect explained',
      'present perfect',
      null,
      null,
      null,
    );
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
