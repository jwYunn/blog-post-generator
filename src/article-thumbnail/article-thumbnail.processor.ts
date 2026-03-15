import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { ArticleOutline } from '../article-outline/article-outline.types';
import { ArticleThumbnailPromptService } from './article-thumbnail-prompt.service';
import { ReplicateImageService } from './replicate-image.service';
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
    private readonly promptService: ArticleThumbnailPromptService,
    private readonly replicateService: ReplicateImageService,
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

    if (!draft.title || !draft.keyword) {
      throw new Error(
        `ArticleDraft #${articleDraftId} is missing title or keyword`,
      );
    }

    draft.status = ArticleDraftStatus.GENERATING_THUMBNAIL;
    await this.draftRepository.save(draft);

    try {
      // 1. 썸네일 프롬프트 생성
      const prompt = this.promptService.buildThumbnailPrompt({
        title: draft.title,
        keyword: draft.keyword,
        outline: draft.outline as unknown as ArticleOutline | null,
      });

      // 2. Replicate 이미지 생성 요청
      const predictionId = await this.replicateService.createPrediction(prompt);

      // 3. polling으로 이미지 URL 획득
      const imageUrl = await this.replicateService.waitForImageUrl(predictionId);

      // 4. 이미지 다운로드 및 sharp 후처리 (webp 1024x1024)
      const fileBuffer =
        await this.imageProcessingService.processThumbnailFromUrl(imageUrl);

      // 5. S3 업로드
      const uploadedUrl = await this.s3UploadService.uploadThumbnail(
        articleDraftId,
        fileBuffer,
      );

      // 6. 결과 저장
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
