import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TopicCandidateEntity } from './topic-candidate.entity';
import { TopicCandidateService } from './topic-candidate.service';
import { TopicCandidateController } from './topic-candidate.controller';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ARTICLE_OUTLINE_QUEUE } from '../article-outline/article-outline.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([TopicCandidateEntity, ArticleDraftEntity]),
    BullModule.registerQueue({ name: ARTICLE_OUTLINE_QUEUE }),
  ],
  controllers: [TopicCandidateController],
  providers: [TopicCandidateService],
  exports: [TopicCandidateService],
})
export class TopicCandidateModule {}
