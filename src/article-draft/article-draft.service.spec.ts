import { ConflictException, NotFoundException } from '@nestjs/common';
import { PublishJobMode } from '../article-publish/dto/create-publish-job.dto';
import { ArticleDraftEntity } from './article-draft.entity';
import { ArticleDraftService } from './article-draft.service';
import { ArticleDraftStatus } from './enums/article-draft-status.enum';

const DRAFT_ID = 'draft-1';
const RECORD_ID = 'record-1';

function buildDraft(
  over: Partial<ArticleDraftEntity> = {},
): ArticleDraftEntity {
  return {
    id: DRAFT_ID,
    title: 'Present perfect explained',
    content: '# Heading\n\nBody text.',
    status: ArticleDraftStatus.REVIEW_READY,
    ...over,
  } as ArticleDraftEntity;
}

describe('ArticleDraftService', () => {
  let draftRepository: any;
  let articlePublishService: any;
  let service: ArticleDraftService;

  function publish() {
    return service.publish(DRAFT_ID, { mode: PublishJobMode.NOW });
  }

  beforeEach(() => {
    draftRepository = { findOne: jest.fn(async () => buildDraft()) };
    articlePublishService = {
      addPublishJob: jest.fn(async () => ({
        jobId: '42',
        publishRecordId: RECORD_ID,
      })),
    };
    service = new ArticleDraftService(
      draftRepository,
      {} as any,
      {} as any,
      articlePublishService,
    );
  });

  describe('publish', () => {
    it('hands a review-ready draft to the publish service', async () => {
      const result = await publish();

      expect(articlePublishService.addPublishJob).toHaveBeenCalledWith(
        DRAFT_ID,
        { mode: PublishJobMode.NOW },
      );
      expect(result).toEqual({ jobId: '42', publishRecordId: RECORD_ID });
    });

    // The retry route, for a publish run that died with its content intact
    it.each([ArticleDraftStatus.FAILED, ArticleDraftStatus.PUBLISHING])(
      'hands a %s draft with content to the publish service',
      async (status) => {
        draftRepository.findOne.mockResolvedValue(buildDraft({ status }));

        await publish();

        expect(articlePublishService.addPublishJob).toHaveBeenCalled();
      },
    );

    // A draft that failed during outline or content generation is FAILED too.
    // Let through, it would get an attempt record the worker could not resolve,
    // blocking every later publish of the draft until a human deleted it.
    it('refuses a failed draft that never got content, before any record is written', async () => {
      draftRepository.findOne.mockResolvedValue(
        buildDraft({ status: ArticleDraftStatus.FAILED, content: null }),
      );

      await expect(publish()).rejects.toThrow(ConflictException);
      await expect(publish()).rejects.toThrow(/no content/);
      expect(articlePublishService.addPublishJob).not.toHaveBeenCalled();
    });

    it('refuses a draft that is already published', async () => {
      draftRepository.findOne.mockResolvedValue(
        buildDraft({ status: ArticleDraftStatus.PUBLISHED }),
      );

      await expect(publish()).rejects.toThrow(/already published/);
      expect(articlePublishService.addPublishJob).not.toHaveBeenCalled();
    });

    it('refuses a draft still being generated', async () => {
      draftRepository.findOne.mockResolvedValue(
        buildDraft({ status: ArticleDraftStatus.GENERATING_THUMBNAIL }),
      );

      await expect(publish()).rejects.toThrow(/not ready to publish/);
      expect(articlePublishService.addPublishJob).not.toHaveBeenCalled();
    });

    it('answers 404 for a draft that does not exist', async () => {
      draftRepository.findOne.mockResolvedValue(null);

      await expect(publish()).rejects.toThrow(NotFoundException);
      expect(articlePublishService.addPublishJob).not.toHaveBeenCalled();
    });
  });
});
