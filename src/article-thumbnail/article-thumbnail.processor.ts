import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { stripTitleCategory } from '../common/utils/title.util';
import { ThumbnailImageProcessingService } from './thumbnail-image-processing.service';
import { ThumbnailS3UploadService } from './thumbnail-s3-upload.service';
import { ARTICLE_THUMBNAIL_QUEUE } from './article-thumbnail.constants';

interface ArticleThumbnailJobPayload {
  articleDraftId: string;
}

@Processor(ARTICLE_THUMBNAIL_QUEUE)
export class ArticleThumbnailProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ArticleDraftEntity)
    private readonly draftRepository: Repository<ArticleDraftEntity>,
    private readonly imageProcessingService: ThumbnailImageProcessingService,
    private readonly s3UploadService: ThumbnailS3UploadService,
  ) {
    super();
  }

  async process(job: Job<ArticleThumbnailJobPayload>): Promise<void> {
    const { articleDraftId } = job.data;

    const draft = await this.draftRepository.findOne({
      where: { id: articleDraftId },
    });

    if (!draft) {
      throw new Error(`ArticleDraft #${articleDraftId} not found`);
    }

    if (!draft.title) {
      throw new Error(`ArticleDraft #${articleDraftId} is missing title`);
    }

    draft.status = ArticleDraftStatus.GENERATING_THUMBNAIL;
    await this.draftRepository.save(draft);

    try {
      // 1. 템플릿에 텍스트 합성
      const fileBuffer =
        await this.imageProcessingService.processThumbnailWithText(
          stripTitleCategory(draft.title),
        );

      // 2. S3 업로드
      const uploadedUrl = await this.s3UploadService.uploadThumbnail(
        articleDraftId,
        fileBuffer,
      );

      // 3. 결과 저장
      draft.thumbnailImageUrl = uploadedUrl;
      draft.status = ArticleDraftStatus.REVIEW_READY;
      draft.errorMessage = null;
      await this.draftRepository.save(draft);
    } catch (error) {
      draft.status = ArticleDraftStatus.FAILED;
      draft.errorMessage =
        error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
      await this.draftRepository.save(draft);
      throw error;
    }
  }
}
