import { Job } from 'bullmq';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { ArticleThumbnailProcessor } from './article-thumbnail.processor';

const DRAFT_ID = 'draft-1';
const UPLOADED_URL = 'https://cdn.example.com/thumbnails/draft-1.png';

describe('ArticleThumbnailProcessor', () => {
  let draft: any;
  let draftRepository: any;
  let imageProcessingService: any;
  let s3UploadService: any;
  let job: Job;
  let processor: ArticleThumbnailProcessor;

  beforeEach(() => {
    draft = {
      id: DRAFT_ID,
      title: '[Grammar] Present perfect explained',
      thumbnailImageUrl: null,
      status: ArticleDraftStatus.CONTENT_GENERATED,
      errorMessage: null,
    };
    draftRepository = {
      findOne: jest.fn(async () => draft),
      save: jest.fn(async (entity) => entity),
    };
    imageProcessingService = {
      processThumbnailWithText: jest.fn(async () => Buffer.from('image-bytes')),
    };
    s3UploadService = { uploadThumbnail: jest.fn(async () => UPLOADED_URL) };
    job = {
      data: { articleDraftId: DRAFT_ID },
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;

    processor = new ArticleThumbnailProcessor(
      draftRepository,
      imageProcessingService,
      s3UploadService,
    );
  });

  // The tag groups the blog; it has no business being burned into the image
  it('overlays the title without its category tag', async () => {
    await processor.process(job);

    expect(
      imageProcessingService.processThumbnailWithText,
    ).toHaveBeenCalledWith('Present perfect explained');
  });

  // The strip only removes a real category tag, so a bracket the model wrote
  // stays in the overlay rather than losing the title its first word
  it('keeps a leading bracket that is not a category tag', async () => {
    draft.title = '[비즈니스] 이메일에서 쓰는 표현';

    await processor.process(job);

    expect(
      imageProcessingService.processThumbnailWithText,
    ).toHaveBeenCalledWith('[비즈니스] 이메일에서 쓰는 표현');
  });

  it('moves the draft to generating_thumbnail before the image is built', async () => {
    let statusWhenCalled: ArticleDraftStatus | undefined;
    imageProcessingService.processThumbnailWithText.mockImplementation(
      async () => {
        statusWhenCalled = draft.status;
        return Buffer.from('image-bytes');
      },
    );

    await processor.process(job);

    expect(statusWhenCalled).toBe(ArticleDraftStatus.GENERATING_THUMBNAIL);
  });

  it('uploads the composited image under the draft id', async () => {
    await processor.process(job);

    expect(s3UploadService.uploadThumbnail).toHaveBeenCalledWith(
      DRAFT_ID,
      Buffer.from('image-bytes'),
    );
  });

  it('stores the url and leaves the draft ready for review', async () => {
    await processor.process(job);

    expect(draft.thumbnailImageUrl).toBe(UPLOADED_URL);
    expect(draft.status).toBe(ArticleDraftStatus.REVIEW_READY);
    expect(draft.errorMessage).toBeNull();
  });

  describe('when the run fails', () => {
    it('marks the draft failed if the image cannot be built', async () => {
      imageProcessingService.processThumbnailWithText.mockRejectedValue(
        new Error('font could not be loaded'),
      );

      await expect(processor.process(job)).rejects.toThrow(
        'font could not be loaded',
      );

      expect(draft.status).toBe(ArticleDraftStatus.FAILED);
      expect(draft.errorMessage).toBe('font could not be loaded');
      expect(s3UploadService.uploadThumbnail).not.toHaveBeenCalled();
    });

    it('marks the draft failed if the upload fails', async () => {
      s3UploadService.uploadThumbnail.mockRejectedValue(
        new Error('s3 refused the object'),
      );

      await expect(processor.process(job)).rejects.toThrow(
        's3 refused the object',
      );

      expect(draft.status).toBe(ArticleDraftStatus.FAILED);
      expect(draft.thumbnailImageUrl).toBeNull();
    });

    it('truncates a long error', async () => {
      s3UploadService.uploadThumbnail.mockRejectedValue(
        new Error('w'.repeat(600)),
      );

      await expect(processor.process(job)).rejects.toThrow();

      expect(draft.errorMessage).toHaveLength(500);
    });

    it('fails when the draft is missing', async () => {
      draftRepository.findOne.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow(
        /ArticleDraft #draft-1 not found/,
      );
      expect(
        imageProcessingService.processThumbnailWithText,
      ).not.toHaveBeenCalled();
    });

    it('fails when the draft has no title', async () => {
      draft.title = '';

      await expect(processor.process(job)).rejects.toThrow(/missing title/);
      expect(
        imageProcessingService.processThumbnailWithText,
      ).not.toHaveBeenCalled();
      expect(draftRepository.save).not.toHaveBeenCalled();
    });
  });
});
