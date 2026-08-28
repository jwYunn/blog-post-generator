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
import { jobFailed, jobStep } from '../common/queue/job-log.util';

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
      const error = new Error(`ArticleDraft #${articleDraftId} not found`);
      await jobFailed(job, error);
      throw error;
    }

    if (!draft.title) {
      const error = new Error(
        `ArticleDraft #${articleDraftId} is missing title`,
      );
      await jobFailed(job, error);
      throw error;
    }

    const overlayText = stripTitleCategory(draft.title);
    await jobStep(job, 10, `draft ${draft.id} - overlay text "${overlayText}"`);

    draft.status = ArticleDraftStatus.GENERATING_THUMBNAIL;
    await this.draftRepository.save(draft);

    try {
      // 1. Composite title text onto template image
      await jobStep(job, 20, 'compositing title onto the template with sharp');
      const fileBuffer =
        await this.imageProcessingService.processThumbnailWithText(overlayText);
      await jobStep(job, 50, `image composited - ${fileBuffer.length} bytes`);

      // 2. Upload to S3
      const uploadedUrl = await this.s3UploadService.uploadThumbnail(
        articleDraftId,
        fileBuffer,
      );
      await jobStep(job, 90, `uploaded to ${uploadedUrl}`);

      // 3. Save result
      draft.thumbnailImageUrl = uploadedUrl;
      draft.status = ArticleDraftStatus.REVIEW_READY;
      draft.errorMessage = null;
      await this.draftRepository.save(draft);

      // End of the auto-chain: nothing is queued, a human publishes from here
      await jobStep(job, 100, `done - draft ${draft.id} is review_ready`);
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
