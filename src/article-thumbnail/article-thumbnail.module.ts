import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleThumbnailProcessor } from './article-thumbnail.processor';
import { ArticleThumbnailPromptService } from './article-thumbnail-prompt.service';
import { ReplicateImageService } from './replicate-image.service';
import { ThumbnailImageProcessingService } from './thumbnail-image-processing.service';
import { ThumbnailS3UploadService } from './thumbnail-s3-upload.service';
import { ARTICLE_THUMBNAIL_QUEUE } from './article-thumbnail.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleDraftEntity]),
    BullModule.registerQueue({ name: ARTICLE_THUMBNAIL_QUEUE }),
    BullBoardModule.forFeature({
      name: ARTICLE_THUMBNAIL_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  providers: [
    ArticleThumbnailProcessor,
    ArticleThumbnailPromptService,
    ReplicateImageService,
    ThumbnailImageProcessingService,
    ThumbnailS3UploadService,
  ],
})
export class ArticleThumbnailModule {}
