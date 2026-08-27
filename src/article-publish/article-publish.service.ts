import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import {
  ArticlePublishRecordEntity,
  PublishSchedule,
} from './article-publish-record.entity';
import { ArticlePublishRecordStatus } from './enums/article-publish-record-status.enum';
import { ARTICLE_PUBLISH_QUEUE, PUBLISH_ARTICLE_JOB } from './constants';
import {
  CreatePublishJobDto,
  PublishJobMode,
} from './dto/create-publish-job.dto';

/** A prior attempt in either of these states makes a new one unsafe */
const BLOCKING_STATUSES = [
  ArticlePublishRecordStatus.ATTEMPTING,
  ArticlePublishRecordStatus.PUBLISHED,
];

@Injectable()
export class ArticlePublishService {
  constructor(
    @InjectQueue(ARTICLE_PUBLISH_QUEUE)
    private readonly publishQueue: Queue,
    @InjectRepository(ArticlePublishRecordEntity)
    private readonly recordRepository: Repository<ArticlePublishRecordEntity>,
    private readonly configService: ConfigService,
  ) {}

  async addPublishJob(
    articleDraftId: string,
    dto: CreatePublishJobDto,
  ): Promise<{ jobId: string; publishRecordId: string }> {
    await this.assertNoBlockingAttempt(articleDraftId);

    // Read here rather than in the processor so the target is fixed when the
    // request is made. It is also where a per-blog setting will arrive once
    // more than one blog is in play.
    const blogName = this.configService.getOrThrow<string>('TISTORY_BLOG_NAME');

    const schedule: PublishSchedule =
      dto.mode === PublishJobMode.SCHEDULE && dto.scheduledAt
        ? { mode: 'schedule', scheduledAt: dto.scheduledAt }
        : { mode: 'now' };

    // Written before the job is queued, not after it succeeds. The record is
    // the only evidence that this draft was ever pointed at the blog, so it has
    // to survive a run that dies before it can report anything back.
    const record = await this.recordRepository.save(
      this.recordRepository.create({
        draftId: articleDraftId,
        blogName,
        schedule,
        permalink: null,
        meta: null,
        status: ArticlePublishRecordStatus.ATTEMPTING,
      }),
    );

    try {
      const job = await this.publishQueue.add(PUBLISH_ARTICLE_JOB, {
        articleDraftId,
        publishRecordId: record.id,
        mode: dto.mode,
        scheduledAt: dto.scheduledAt,
      });
      return { jobId: String(job.id), publishRecordId: record.id };
    } catch (error) {
      // The job never reached the queue, so nothing can have been posted and
      // this record must not be left behind to block the next attempt.
      await this.recordRepository.delete(record.id);
      throw error;
    }
  }

  /**
   * Refuses a publish whose draft already carries an attempt that either
   * succeeded or never reported back. Resolving the latter is deliberately a
   * human step: only someone looking at the blog can tell the two apart.
   */
  private async assertNoBlockingAttempt(draftId: string): Promise<void> {
    const [record] = await this.recordRepository.find({
      where: { draftId, status: In(BLOCKING_STATUSES) },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (!record) return;

    if (record.status === ArticlePublishRecordStatus.PUBLISHED) {
      throw new ConflictException(
        `ArticleDraft #${draftId} was already published (record #${record.id}).`,
      );
    }

    throw new ConflictException(
      `ArticleDraft #${draftId} has a publish attempt that never reported back ` +
        `(record #${record.id}). Check the blog for the post, then delete that ` +
        `record or set its status to "failed" before publishing again.`,
    );
  }
}
