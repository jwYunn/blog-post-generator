import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleContentProcessor } from './article-content.processor';
import { ArticleContentAiService } from './article-content-ai.service';
import { ARTICLE_CONTENT_QUEUE } from './article-content.constants';
import { ARTICLE_THUMBNAIL_QUEUE } from '../article-thumbnail/article-thumbnail.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleDraftEntity]),
    BullModule.registerQueue({
      name: ARTICLE_CONTENT_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 604_800 },
        removeOnFail: { age: 604_800 },
      },
    }),
    BullModule.registerQueue({ name: ARTICLE_THUMBNAIL_QUEUE }),
    BullBoardModule.forFeature({ name: ARTICLE_CONTENT_QUEUE, adapter: BullMQAdapter }),
  ],
  providers: [ArticleContentProcessor, ArticleContentAiService],
})
export class ArticleContentModule {}
