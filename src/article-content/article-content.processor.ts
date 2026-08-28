import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { ArticleOutline } from '../article-outline/article-outline.types';
import { ArticleContentAiService } from './article-content-ai.service';
import { ARTICLE_CONTENT_QUEUE } from './article-content.constants';
import {
  ARTICLE_THUMBNAIL_QUEUE,
  GENERATE_ARTICLE_THUMBNAIL_JOB,
} from '../article-thumbnail/article-thumbnail.constants';
import { jobFailed, jobStep } from '../common/queue/job-log.util';

interface ArticleContentJobPayload {
  articleDraftId: string;
}

@Processor(ARTICLE_CONTENT_QUEUE, { concurrency: 3 })
export class ArticleContentProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    private readonly articleContentAiService: ArticleContentAiService,
    @InjectQueue(ARTICLE_THUMBNAIL_QUEUE)
    private readonly articleThumbnailQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ArticleContentJobPayload>): Promise<void> {
    const { articleDraftId } = job.data;

    const draft = await this.draftRepository.findOne({
      where: { id: articleDraftId },
    });
    if (!draft) {
      const error = new Error(`ArticleDraft #${articleDraftId} not found`);
      await jobFailed(job, error);
      throw error;
    }
    if (!draft.outline) {
      const error = new Error(`ArticleDraft #${articleDraftId} has no outline`);
      await jobFailed(job, error);
      throw error;
    }

    const outline = draft.outline as unknown as ArticleOutline;
    await jobStep(
      job,
      10,
      `draft ${draft.id} "${draft.title}" - outline has ` +
        `${outline.sections.length} sections`,
    );

    draft.status = ArticleDraftStatus.GENERATING_CONTENT;
    await this.draftRepository.save(draft);

    try {
      await jobStep(
        job,
        20,
        'calling claude-sonnet-4-6 (content) and claude-haiku-4-5 (hashtags) in parallel',
      );

      const [content, hashtags] = await Promise.all([
        this.articleContentAiService.generateContent({
          title: draft.title,
          keyword: draft.keyword,
          outline,
        }),
        this.articleContentAiService.generateHashtags({
          title: draft.title,
          keyword: draft.keyword,
        }),
      ]);

      // Length is the one number worth keeping: the prompt targets 1,800-2,500
      // Korean characters, so a run that drifts shows up here first.
      await jobStep(
        job,
        80,
        `content: ${content.length} chars, hashtags: ${hashtags.length}`,
      );

      draft.content = content;
      draft.hashtags = hashtags;
      draft.status = ArticleDraftStatus.CONTENT_GENERATED;
      draft.errorMessage = null;
      await this.draftRepository.save(draft);

      const next = await this.articleThumbnailQueue.add(
        GENERATE_ARTICLE_THUMBNAIL_JOB,
        { articleDraftId: draft.id },
      );
      await jobStep(job, 100, `done - queued article-thumbnail job ${next.id}`);
    } catch (error) {
      await jobFailed(job, error);
      draft.status = ArticleDraftStatus.FAILED;
      draft.errorMessage =
        error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
      await this.draftRepository.save(draft);
      throw error;
    }
  }
}
