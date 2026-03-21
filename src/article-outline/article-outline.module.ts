import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleOutlineProcessor } from './article-outline.processor';
import { ArticleOutlineAiService } from './article-outline-ai.service';
import { ARTICLE_OUTLINE_QUEUE } from './article-outline.constants';
import { ARTICLE_CONTENT_QUEUE } from '../article-content/article-content.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleDraftEntity]),
    BullModule.registerQueue({
      name: ARTICLE_OUTLINE_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 604_800 },
        removeOnFail: { age: 604_800 },
      },
    }),
    BullModule.registerQueue({
      name: ARTICLE_CONTENT_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 604_800 },
        removeOnFail: { age: 604_800 },
      },
    }),
  ],
  providers: [ArticleOutlineProcessor, ArticleOutlineAiService],
})
export class ArticleOutlineModule {}
