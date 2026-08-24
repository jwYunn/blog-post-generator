import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import {
  ArticlePublishRecordEntity,
  PublishSchedule,
} from './article-publish-record.entity';
import { TistorySessionService } from './tistory/tistory-session.service';
import { runTistoryPublish } from './tistory/tistory-automation';
import { PublishMode } from './tistory/tistory.types';
import { ARTICLE_PUBLISH_QUEUE } from './constants';
import { isEnabled } from '../config/env.validation';

interface ArticlePublishJobPayload {
  articleDraftId: string;
  mode: 'now' | 'schedule';
  scheduledAt?: string; // ISO string
}

// maxStalledCount 0 closes the second path back into a rerun: `attempts: 1`
// only governs failures, while a stalled job - one whose worker died mid-publish
// - is otherwise re-queued once by default. That job may already have posted the
// article, so it fails outright instead and is left for a human to check.
@Processor(ARTICLE_PUBLISH_QUEUE, { concurrency: 1, maxStalledCount: 0 })
export class ArticlePublishProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    @InjectRepository(ArticlePublishRecordEntity)
    private readonly publishRecordRepository: Repository<ArticlePublishRecordEntity>,
    private readonly tistorySessionService: TistorySessionService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ArticlePublishJobPayload>): Promise<void> {
    const { articleDraftId, mode, scheduledAt } = job.data;

    const draft = await this.draftRepository.findOne({
      where: { id: articleDraftId },
      relations: ['topicCandidate', 'topicCandidate.topicSeed'],
    });
    if (!draft) {
      throw new Error(`ArticleDraft #${articleDraftId} not found`);
    }
    if (!draft.content) {
      throw new Error(`ArticleDraft #${articleDraftId} has no content`);
    }

    draft.status = ArticleDraftStatus.PUBLISHING;
    await this.draftRepository.save(draft);

    try {
      const kakaoId = this.configService.get<string>('KAKAO_ID');
      const kakaoPassword = this.configService.get<string>('KAKAO_PASSWORD');
      if (!kakaoId || !kakaoPassword) {
        throw new Error(
          'KAKAO_ID or KAKAO_PASSWORD environment variable is not set.',
        );
      }
      // Guaranteed present - validateEnv rejects startup without it
      const blogName =
        this.configService.getOrThrow<string>('TISTORY_BLOG_NAME');
      // validateEnv only demands BROWSERLESS_URL when this flag is off
      const useLocalBrowser = isEnabled(
        this.configService.get<string>('BROWSER_DEBUG_LOCAL'),
      );
      const browserlessUrl = useLocalBrowser
        ? undefined
        : this.configService.getOrThrow<string>('BROWSERLESS_URL');

      const publishMode: PublishMode =
        mode === 'schedule' && scheduledAt
          ? { mode: 'schedule', datetime: new Date(scheduledAt) }
          : { mode: 'now' };

      const { permalink } = await runTistoryPublish({
        draft: {
          title: draft.title,
          content: draft.content,
          thumbnailImageUrl: draft.thumbnailImageUrl,
          hashtags: draft.hashtags,
          category: (draft.topicCandidate as any).topicSeed.category,
        },
        publishMode,
        sessionProvider: this.tistorySessionService,
        kakaoId,
        kakaoPassword,
        blogName,
        browserlessUrl,
        useLocalBrowser,
      });

      draft.status = ArticleDraftStatus.PUBLISHED;
      draft.errorMessage = null;
      await this.draftRepository.save(draft);

      const schedule: PublishSchedule =
        mode === 'schedule' && scheduledAt
          ? { mode: 'schedule', scheduledAt }
          : { mode: 'now' };

      const record = this.publishRecordRepository.create({
        draftId: articleDraftId,
        permalink,
        schedule,
        meta: null,
      });
      await this.publishRecordRepository.save(record);
    } catch (error) {
      draft.status = ArticleDraftStatus.FAILED;
      draft.errorMessage =
        error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
      await this.draftRepository.save(draft);
      throw error;
    }
  }
}
