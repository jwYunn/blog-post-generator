import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticlePublishRecordEntity } from './article-publish-record.entity';
import { ArticlePublishProcessor } from './article-publish.processor';
import { ArticlePublishService } from './article-publish.service';
import { TistorySessionService } from './tistory/tistory-session.service';
import { ARTICLE_PUBLISH_QUEUE } from './constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleDraftEntity, ArticlePublishRecordEntity]),
    BullModule.registerQueue({ name: ARTICLE_PUBLISH_QUEUE }),
    BullBoardModule.forFeature({ name: ARTICLE_PUBLISH_QUEUE, adapter: BullMQAdapter }),
  ],
  providers: [ArticlePublishProcessor, ArticlePublishService, TistorySessionService],
  exports: [ArticlePublishService],
})
export class ArticlePublishModule {}
