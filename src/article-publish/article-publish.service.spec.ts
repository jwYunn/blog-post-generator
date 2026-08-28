import { ConflictException } from '@nestjs/common';
import { In } from 'typeorm';
import { ArticlePublishService } from './article-publish.service';
import { ArticlePublishRecordStatus } from './enums/article-publish-record-status.enum';
import { PUBLISH_ARTICLE_JOB } from './constants';
import {
  CreatePublishJobDto,
  PublishJobMode,
} from './dto/create-publish-job.dto';

const DRAFT_ID = 'draft-1';
const RECORD_ID = 'record-1';
const BLOG_NAME = 'my-blog';
const SCHEDULED_AT = '2026-09-01T09:00:00.000Z';

describe('ArticlePublishService', () => {
  let recordRepository: any;
  let publishQueue: any;
  let configService: any;
  let service: ArticlePublishService;

  function publish(dto: CreatePublishJobDto) {
    return service.addPublishJob(DRAFT_ID, dto);
  }

  function existingAttempt(status: ArticlePublishRecordStatus) {
    recordRepository.find.mockResolvedValue([{ id: 'earlier-record', status }]);
  }

  beforeEach(() => {
    recordRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: RECORD_ID, ...data })),
      delete: jest.fn(),
    };
    publishQueue = { add: jest.fn(async () => ({ id: 42 })) };
    configService = { getOrThrow: jest.fn(() => BLOG_NAME) };
    service = new ArticlePublishService(
      publishQueue,
      recordRepository,
      configService,
    );
  });

  describe('queueing a publish', () => {
    it('writes an attempting record and queues the job', async () => {
      const result = await publish({ mode: PublishJobMode.NOW });

      expect(recordRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: DRAFT_ID,
          blogName: BLOG_NAME,
          status: ArticlePublishRecordStatus.ATTEMPTING,
          schedule: { mode: 'now' },
          permalink: null,
        }),
      );
      expect(publishQueue.add).toHaveBeenCalledWith(PUBLISH_ARTICLE_JOB, {
        articleDraftId: DRAFT_ID,
        publishRecordId: RECORD_ID,
        mode: PublishJobMode.NOW,
        scheduledAt: undefined,
      });
      expect(result).toEqual({ jobId: '42', publishRecordId: RECORD_ID });
    });

    // The record is the only evidence the draft was ever pointed at the blog.
    // Written after the enqueue it would be missing for exactly the run that
    // needs it - one that dies before it can report anything back.
    it('records the attempt before the job reaches the queue', async () => {
      const order: string[] = [];
      recordRepository.save.mockImplementation(async (data: object) => {
        order.push('record');
        return { id: RECORD_ID, ...data };
      });
      publishQueue.add.mockImplementation(async () => {
        order.push('enqueue');
        return { id: 42 };
      });

      await publish({ mode: PublishJobMode.NOW });

      expect(order).toEqual(['record', 'enqueue']);
    });

    it('stores the requested schedule on the record', async () => {
      await publish({
        mode: PublishJobMode.SCHEDULE,
        scheduledAt: SCHEDULED_AT,
      });

      expect(recordRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: { mode: 'schedule', scheduledAt: SCHEDULED_AT },
        }),
      );
    });

    it('ignores a scheduled time on a publish-now request', async () => {
      await publish({
        mode: PublishJobMode.NOW,
        scheduledAt: SCHEDULED_AT,
      });

      expect(recordRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ schedule: { mode: 'now' } }),
      );
    });

    // Removing the record matters as much as writing it: an attempt that never
    // reached the queue would otherwise block every later publish of this draft.
    it('removes the record when the job cannot be queued', async () => {
      publishQueue.add.mockRejectedValue(new Error('redis is down'));

      await expect(publish({ mode: PublishJobMode.NOW })).rejects.toThrow(
        'redis is down',
      );
      expect(recordRepository.delete).toHaveBeenCalledWith(RECORD_ID);
    });
  });

  describe('refusing a publish that could duplicate a post', () => {
    it('refuses a draft that was already published', async () => {
      existingAttempt(ArticlePublishRecordStatus.PUBLISHED);

      await expect(publish({ mode: PublishJobMode.NOW })).rejects.toThrow(
        /already published/,
      );
      expect(recordRepository.save).not.toHaveBeenCalled();
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    // An attempt stuck at attempting may or may not have posted. Only someone
    // looking at the blog can tell, so the API refuses rather than guessing.
    it('refuses a draft whose last attempt never reported back', async () => {
      existingAttempt(ArticlePublishRecordStatus.ATTEMPTING);

      const publishing = publish({ mode: PublishJobMode.NOW });

      await expect(publishing).rejects.toBeInstanceOf(ConflictException);
      await expect(publishing).rejects.toThrow(/never reported back/);
      expect(publishQueue.add).not.toHaveBeenCalled();
    });

    it('treats only attempting and published attempts as blocking', async () => {
      await publish({ mode: PublishJobMode.NOW });

      expect(recordRepository.find).toHaveBeenCalledWith({
        where: {
          draftId: DRAFT_ID,
          status: In([
            ArticlePublishRecordStatus.ATTEMPTING,
            ArticlePublishRecordStatus.PUBLISHED,
          ]),
        },
        order: { createdAt: 'DESC' },
        take: 1,
      });
    });
  });
});
