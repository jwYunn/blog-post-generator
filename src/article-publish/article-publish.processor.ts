import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { ArticlePublishRecordEntity, PublishSchedule } from './article-publish-record.entity';
import { TistorySessionService } from './tistory/tistory-session.service';
import { runTistoryPublish } from './tistory/tistory-automation';
import { PublishMode } from './tistory/tistory.types';
import { ARTICLE_PUBLISH_QUEUE } from './constants';

interface ArticlePublishJobPayload {
  articleDraftId: string;
  mode: 'now' | 'schedule';
  scheduledAt?: string; // ISO string
}

@Processor(ARTICLE_PUBLISH_QUEUE)
export class ArticlePublishProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    @InjectRepository(ArticlePublishRecordEntity)
    private readonly publishRecordRepository: Repository<ArticlePublishRecordEntity>,
    private readonly tistorySessionService: TistorySessionService,
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
      const kakaoId = process.env.KAKAO_ID;
      const kakaoPassword = process.env.KAKAO_PASSWORD;
      if (!kakaoId || !kakaoPassword) {
        throw new Error('KAKAO_ID 또는 KAKAO_PASSWORD 환경변수가 설정되지 않았습니다.');
      }

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
        headless: true,
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
