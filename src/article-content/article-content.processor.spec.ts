import { Job } from 'bullmq';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { GENERATE_ARTICLE_THUMBNAIL_JOB } from '../article-thumbnail/article-thumbnail.constants';
import { ArticleOutline } from '../article-outline/article-outline.types';
import { ArticleContentProcessor } from './article-content.processor';
import { ArticleDepth } from '../topic-candidate/enums/article-depth.enum';

const DRAFT_ID = 'draft-1';
const CONTENT = '# Heading\n\nBody text.';
const HASHTAGS = ['#영어공부', '#LearnEnglish'];

const OUTLINE: ArticleOutline = {
  title: 'Present perfect explained',
  keyword: 'present perfect',
  searchIntent: 'informational',
  sections: ['What it is', 'When to use it'],
  faqs: [],
};

describe('ArticleContentProcessor', () => {
  let draft: any;
  let draftRepository: any;
  let contentAiService: any;
  let thumbnailQueue: any;
  let job: Job;
  let processor: ArticleContentProcessor;

  beforeEach(() => {
    draft = {
      id: DRAFT_ID,
      title: '[Grammar] Present perfect explained',
      keyword: 'present perfect',
      outline: OUTLINE,
      content: null,
      hashtags: null,
      status: ArticleDraftStatus.OUTLINE_GENERATED,
      errorMessage: null,
    };
    draftRepository = {
      findOne: jest.fn(async () => draft),
      save: jest.fn(async (entity) => entity),
    };
    contentAiService = {
      generateContent: jest.fn(async () => CONTENT),
      generateHashtags: jest.fn(async () => HASHTAGS),
    };
    thumbnailQueue = { add: jest.fn(async () => ({ id: 88 })) };
    job = {
      data: { articleDraftId: DRAFT_ID },
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;

    processor = new ArticleContentProcessor(
      draftRepository,
      contentAiService,
      thumbnailQueue,
    );
  });

  it('moves the draft to generating_content before calling the models', async () => {
    let statusWhenCalled: ArticleDraftStatus | undefined;
    contentAiService.generateContent.mockImplementation(async () => {
      statusWhenCalled = draft.status;
      return CONTENT;
    });

    await processor.process(job);

    expect(statusWhenCalled).toBe(ArticleDraftStatus.GENERATING_CONTENT);
  });

  it('stores the content and the hashtags', async () => {
    await processor.process(job);

    expect(draft.content).toBe(CONTENT);
    expect(draft.hashtags).toEqual(HASHTAGS);
    expect(draft.status).toBe(ArticleDraftStatus.CONTENT_GENERATED);
    expect(draft.errorMessage).toBeNull();
  });

  it('queues the thumbnail job for the same draft', async () => {
    await processor.process(job);

    expect(thumbnailQueue.add).toHaveBeenCalledWith(
      GENERATE_ARTICLE_THUMBNAIL_JOB,
      { articleDraftId: DRAFT_ID },
    );
  });

  // The fixture outline predates depth, as every outline built before it does
  it('builds the content from the stored outline, as standard when it has no depth', async () => {
    await processor.process(job);

    expect(contentAiService.generateContent).toHaveBeenCalledWith({
      title: '[Grammar] Present perfect explained',
      keyword: 'present perfect',
      outline: OUTLINE,
      depth: ArticleDepth.STANDARD,
    });
  });

  describe('length by depth', () => {
    function jobLogText(): string {
      return (job.log as jest.Mock).mock.calls
        .map((call) => call[0])
        .join('\n');
    }

    // Read from the outline, not the candidate: the length follows the
    // structure the article is actually being written to
    it('writes a brief outline to the brief length', async () => {
      draft.outline = { ...OUTLINE, depth: ArticleDepth.BRIEF };

      await processor.process(job);

      expect(contentAiService.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ depth: ArticleDepth.BRIEF }),
      );
      expect(jobLogText()).toContain('(brief target 800-1,200)');
    });

    it('warns when an article runs past its ceiling', async () => {
      draft.outline = { ...OUTLINE, depth: ArticleDepth.BRIEF };
      contentAiService.generateContent.mockResolvedValue('가'.repeat(1600));

      await processor.process(job);

      expect(jobLogText()).toContain(
        'WARNING: 1600 chars is over the brief ceiling of 1,500',
      );
      // Kept, not failed: a long article is still an article
      expect(draft.content).toHaveLength(1600);
    });

    it('says nothing when the article fits', async () => {
      await processor.process(job);

      expect(jobLogText()).not.toContain('WARNING');
    });
  });

  // Hashtags fail on their own often enough - a short model, a short response -
  // and taking the article down with them is the point of running them together
  it('fails the draft when only the hashtags fail', async () => {
    contentAiService.generateHashtags.mockRejectedValue(
      new Error('hashtags came back empty'),
    );

    await expect(processor.process(job)).rejects.toThrow(
      'hashtags came back empty',
    );

    expect(draft.status).toBe(ArticleDraftStatus.FAILED);
    expect(draft.errorMessage).toBe('hashtags came back empty');
    expect(thumbnailQueue.add).not.toHaveBeenCalled();
  });

  it('marks the draft failed and records why', async () => {
    contentAiService.generateContent.mockRejectedValue(
      new Error('claude returned nothing'),
    );

    await expect(processor.process(job)).rejects.toThrow(
      'claude returned nothing',
    );

    expect(draft.status).toBe(ArticleDraftStatus.FAILED);
    expect(thumbnailQueue.add).not.toHaveBeenCalled();
  });

  it('truncates a long error', async () => {
    contentAiService.generateContent.mockRejectedValue(
      new Error('z'.repeat(600)),
    );

    await expect(processor.process(job)).rejects.toThrow();

    expect(draft.errorMessage).toHaveLength(500);
  });

  describe('when there is nothing to work from', () => {
    it('fails when the draft is missing', async () => {
      draftRepository.findOne.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow(
        /ArticleDraft #draft-1 not found/,
      );
      expect(contentAiService.generateContent).not.toHaveBeenCalled();
    });

    // Reaching the model with no outline burns a long call to produce something
    // that does not follow the plan the draft was approved on
    it('fails when the outline is missing, before the model runs', async () => {
      draft.outline = null;

      await expect(processor.process(job)).rejects.toThrow(/has no outline/);
      expect(contentAiService.generateContent).not.toHaveBeenCalled();
      expect(draftRepository.save).not.toHaveBeenCalled();
      expect(draft.status).toBe(ArticleDraftStatus.OUTLINE_GENERATED);
    });
  });
});
