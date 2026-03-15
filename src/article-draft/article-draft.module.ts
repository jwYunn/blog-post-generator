import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ArticleDraftEntity } from './article-draft.entity';
import { ArticleDraftService } from './article-draft.service';
import { ArticleDraftController } from './article-draft.controller';
import { TopicCandidateEntity } from '../topic-candidate/topic-candidate.entity';
import { ARTICLE_OUTLINE_QUEUE } from '../article-outline/article-outline.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleDraftEntity, TopicCandidateEntity]),
    BullModule.registerQueue({ name: ARTICLE_OUTLINE_QUEUE }),
    BullBoardModule.forFeature({ name: ARTICLE_OUTLINE_QUEUE, adapter: BullMQAdapter }),
  ],
  controllers: [ArticleDraftController],
  providers: [ArticleDraftService],
})
export class ArticleDraftModule {}
