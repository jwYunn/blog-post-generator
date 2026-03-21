import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticlePublishRecordEntity } from './article-publish-record.entity';
import { ArticlePublishProcessor } from './article-publish.processor';
import { ArticlePublishService } from './article-publish.service';
import { ArticlePublishRecordService } from './article-publish-record.service';
import { ArticlePublishRecordController } from './article-publish-record.controller';
import { TistorySessionService } from './tistory/tistory-session.service';
import { ARTICLE_PUBLISH_QUEUE } from './constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleDraftEntity, ArticlePublishRecordEntity]),
    BullModule.registerQueue({
      name: ARTICLE_PUBLISH_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 604_800 },
        removeOnFail: { age: 604_800 },
      },
    }),
    BullBoardModule.forFeature({ name: ARTICLE_PUBLISH_QUEUE, adapter: BullMQAdapter }),
  ],
  controllers: [ArticlePublishRecordController],
  providers: [
    ArticlePublishProcessor,
    ArticlePublishService,
    ArticlePublishRecordService,
    TistorySessionService,
  ],
  exports: [ArticlePublishService, ArticlePublishRecordService],
})
export class ArticlePublishModule {}
