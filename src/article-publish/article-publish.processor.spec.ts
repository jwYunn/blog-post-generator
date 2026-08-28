import { Job } from 'bullmq';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { ArticlePublishProcessor } from './article-publish.processor';
import { ArticlePublishRecordStatus } from './enums/article-publish-record-status.enum';
import { runTistoryPublish } from './tistory/tistory-automation';

// Stands in for the browser half. Mocking the module also keeps playwright out
// of the test run entirely.
jest.mock('./tistory/tistory-automation', () => ({
  runTistoryPublish: jest.fn(),
}));

const runPublish = runTistoryPublish as jest.MockedFunction<
  typeof runTistoryPublish
>;

const DRAFT_ID = 'draft-1';
const RECORD_ID = 'record-1';
const PERMALINK = 'https://my-blog.tistory.com/42';
const SCHEDULED_AT = '2026-09-01T09:00:00.000Z';

const CONFIG: Record<string, string> = {
  KAKAO_ID: 'kakao-id',
  KAKAO_PASSWORD: 'kakao-pw',
  TISTORY_BLOG_NAME: 'configured-blog',
  BROWSERLESS_URL: 'ws://browserless:3000',
};

describe('ArticlePublishProcessor', () => {
  let draft: any;
  let record: any;
  let draftRepository: any;
  let publishRecordRepository: any;
  let job: Job;
  let processor: ArticlePublishProcessor;

  function buildJob(data: Record<string, unknown> = {}): Job {
    return {
      data: {
        articleDraftId: DRAFT_ID,
        publishRecordId: RECORD_ID,
        mode: 'now',
        ...data,
      },
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;
  }

  /** Everything the processor wrote to the job's own log, as one string */
  function jobLogText(): string {
    return (job.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
  }

  beforeEach(() => {
    // runPublish is a module-level mock, so its calls survive a test unless
    // they are cleared here. The repository stubs below are rebuilt anyway.
    jest.clearAllMocks();

    draft = {
      id: DRAFT_ID,
      title: '[Grammar] Present perfect explained',
      content: '# Heading\n\nBody text.',
      thumbnailImageUrl: null,
      hashtags: ['english'],
      status: ArticleDraftStatus.REVIEW_READY,
      errorMessage: null,
      topicCandidate: { topicSeed: { category: 'grammar' } },
    };
    record = {
      id: RECORD_ID,
      blogName: 'my-blog',
      status: ArticlePublishRecordStatus.ATTEMPTING,
      permalink: null,
    };
    draftRepository = {
      findOne: jest.fn(async () => draft),
      save: jest.fn(async (entity) => entity),
    };
    publishRecordRepository = {
      findOne: jest.fn(async () => record),
      save: jest.fn(async (entity) => entity),
    };
    job = buildJob();
    runPublish.mockResolvedValue({ permalink: PERMALINK });

    processor = new ArticlePublishProcessor(
      draftRepository,
      publishRecordRepository,
      {} as any,
      {
        get: jest.fn((key: string) => CONFIG[key]),
        getOrThrow: jest.fn((key: string) => CONFIG[key]),
      } as any,
    );
  });

  describe('a run that succeeds', () => {
    it('marks the draft and the record published, and keeps the permalink', async () => {
      await processor.process(job);

      expect(draft.status).toBe(ArticleDraftStatus.PUBLISHED);
      expect(draft.errorMessage).toBeNull();
      expect(record.status).toBe(ArticlePublishRecordStatus.PUBLISHED);
      expect(record.permalink).toBe(PERMALINK);
    });

    it('moves the draft to publishing before the browser is driven', async () => {
      let statusWhenBrowserRan: ArticleDraftStatus | undefined;
      runPublish.mockImplementation(async () => {
        statusWhenBrowserRan = draft.status;
        return { permalink: PERMALINK };
      });

      await processor.process(job);

      expect(statusWhenBrowserRan).toBe(ArticleDraftStatus.PUBLISHING);
    });

    it('publishes to the blog the record fixed when the request came in', async () => {
      await processor.process(job);

      expect(runPublish).toHaveBeenCalledWith(
        expect.objectContaining({ blogName: 'my-blog' }),
      );
    });

    it('falls back to the configured blog for a record that names none', async () => {
      record.blogName = null;

      await processor.process(job);

      expect(runPublish).toHaveBeenCalledWith(
        expect.objectContaining({ blogName: 'configured-blog' }),
      );
    });

    it('passes a scheduled publish through as a date', async () => {
      job = buildJob({ mode: 'schedule', scheduledAt: SCHEDULED_AT });

      await processor.process(job);

      expect(runPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          publishMode: { mode: 'schedule', datetime: new Date(SCHEDULED_AT) },
        }),
      );
    });

    it('treats a schedule request carrying no time as publish now', async () => {
      job = buildJob({ mode: 'schedule' });

      await processor.process(job);

      expect(runPublish).toHaveBeenCalledWith(
        expect.objectContaining({ publishMode: { mode: 'now' } }),
      );
    });
  });

  /**
   * The guard against a duplicate post. Where the run stopped decides whether a
   * retry is safe, and only the run itself knows - so onBeforePublish is what
   * separates the two outcomes.
   */
  describe('a run that fails', () => {
    it('marks the record failed when nothing can have been posted', async () => {
      runPublish.mockRejectedValue(new Error('kakao login failed'));

      await expect(processor.process(job)).rejects.toThrow(
        'kakao login failed',
      );

      expect(record.status).toBe(ArticlePublishRecordStatus.FAILED);
      expect(draft.status).toBe(ArticleDraftStatus.FAILED);
      expect(draft.errorMessage).toBe('kakao login failed');
      expect(jobLogText()).toContain('safe to retry');
    });

    it('leaves the record attempting once a post may exist', async () => {
      runPublish.mockImplementation(async (opts) => {
        await opts.onBeforePublish?.();
        throw new Error('editor closed mid-publish');
      });

      await expect(processor.process(job)).rejects.toThrow(
        'editor closed mid-publish',
      );

      // Attempting is what blocks the next publish, which is the point: a
      // human has to look at the blog before this draft can go out again.
      expect(record.status).toBe(ArticlePublishRecordStatus.ATTEMPTING);
      expect(draft.status).toBe(ArticleDraftStatus.FAILED);
      expect(jobLogText()).toContain('check the blog before retrying');
    });

    it('records that the point of no return was passed', async () => {
      runPublish.mockImplementation(async (opts) => {
        await opts.onBeforePublish?.();
        throw new Error('editor closed mid-publish');
      });

      await expect(processor.process(job)).rejects.toThrow();

      expect(jobLogText()).toContain('PAST THE POINT OF NO RETURN');
    });

    it('truncates a long error before storing it on the draft', async () => {
      runPublish.mockRejectedValue(new Error('x'.repeat(600)));

      await expect(processor.process(job)).rejects.toThrow();

      expect(draft.errorMessage).toHaveLength(500);
    });
  });

  describe('a run that never reaches the browser', () => {
    it('fails when the attempt record is missing', async () => {
      publishRecordRepository.findOne.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow(
        /ArticlePublishRecord #record-1 not found/,
      );
      expect(runPublish).not.toHaveBeenCalled();
      expect(draftRepository.save).not.toHaveBeenCalled();
    });

    it('fails when the draft is missing', async () => {
      draftRepository.findOne.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow(
        /ArticleDraft #draft-1 not found/,
      );
      expect(runPublish).not.toHaveBeenCalled();
    });

    // Publishing an empty article is worse than not publishing it, and the
    // record stays untouched so the draft can go out once it has content.
    it('fails when the draft has no content, leaving the record alone', async () => {
      draft.content = null;

      await expect(processor.process(job)).rejects.toThrow(/has no content/);
      expect(runPublish).not.toHaveBeenCalled();
      expect(publishRecordRepository.save).not.toHaveBeenCalled();
      expect(record.status).toBe(ArticlePublishRecordStatus.ATTEMPTING);
    });
  });
});
