import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { ArticleOutlineAiService } from './article-outline-ai.service';
import { ARTICLE_OUTLINE_QUEUE } from './article-outline.constants';
import {
  ARTICLE_CONTENT_QUEUE,
  GENERATE_ARTICLE_CONTENT_JOB,
} from '../article-content/article-content.constants';

interface ArticleOutlineJobPayload {
  articleDraftId: string;
}

@Processor(ARTICLE_OUTLINE_QUEUE, { concurrency: 3 })
export class ArticleOutlineProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    private readonly articleOutlineAiService: ArticleOutlineAiService,
    @InjectQueue(ARTICLE_CONTENT_QUEUE)
    private readonly articleContentQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ArticleOutlineJobPayload>): Promise<void> {
    const { articleDraftId } = job.data;

    const draft = await this.draftRepository.findOne({
      where: { id: articleDraftId },
      relations: ['topicCandidate'],
    });
    if (!draft) {
      throw new Error(`ArticleDraft #${articleDraftId} not found`);
    }

    draft.status = ArticleDraftStatus.GENERATING_OUTLINE;
    await this.draftRepository.save(draft);

    try {
      const candidate = draft.topicCandidate;

      const outline = await this.articleOutlineAiService.generateOutline(
        draft.title,
        draft.keyword,
        candidate?.searchIntent ?? null,
        candidate?.targetReader ?? null,
        candidate?.outlinePreview ?? null,
      );

      draft.outline = outline;
      draft.status = ArticleDraftStatus.OUTLINE_GENERATED;
      draft.errorMessage = null;
      await this.draftRepository.save(draft);

      await this.articleContentQueue.add(GENERATE_ARTICLE_CONTENT_JOB, {
        articleDraftId: draft.id,
      });
    } catch (error) {
      draft.status = ArticleDraftStatus.FAILED;
      draft.errorMessage =
        error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
      await this.draftRepository.save(draft);
      throw error;
    }
  }
}
