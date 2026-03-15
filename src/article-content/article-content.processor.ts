import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { ArticleOutline } from '../article-outline/article-outline.types';
import { ArticleContentAiService } from './article-content-ai.service';
import { ARTICLE_CONTENT_QUEUE } from './article-content.constants';

interface ArticleContentJobPayload {
  articleDraftId: string;
}

@Processor(ARTICLE_CONTENT_QUEUE)
export class ArticleContentProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    private readonly articleContentAiService: ArticleContentAiService,
  ) {
    super();
  }

  async process(job: Job<ArticleContentJobPayload>): Promise<void> {
    const { articleDraftId } = job.data;

    const draft = await this.draftRepository.findOne({
      where: { id: articleDraftId },
    });
    if (!draft) {
      throw new Error(`ArticleDraft #${articleDraftId} not found`);
    }
    if (!draft.outline) {
      throw new Error(`ArticleDraft #${articleDraftId} has no outline`);
    }

    draft.status = ArticleDraftStatus.GENERATING_CONTENT;
    await this.draftRepository.save(draft);

    try {
      const content = await this.articleContentAiService.generateContent({
        title: draft.title,
        keyword: draft.keyword,
        outline: draft.outline as unknown as ArticleOutline,
      });

      draft.content = content;
      draft.status = ArticleDraftStatus.CONTENT_GENERATED;
      draft.errorMessage = null;
      await this.draftRepository.save(draft);

      // TODO: enqueue thumbnail generation job
    } catch (error) {
      draft.status = ArticleDraftStatus.FAILED;
      draft.errorMessage =
        error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
      await this.draftRepository.save(draft);
      throw error;
    }
  }
}
