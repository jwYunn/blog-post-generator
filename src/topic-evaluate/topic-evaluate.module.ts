import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { TopicEvaluateProcessor } from './topic-evaluate.processor';
import { TopicEvaluateAiService } from './topic-evaluate-ai.service';
import {
  TOPIC_EVALUATE_QUEUE,
  TOPIC_EVALUATE_JOB_OPTIONS,
} from './topic-evaluate.constants';
import { TopicCandidateModule } from '../topic-candidate/topic-candidate.module';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: TOPIC_EVALUATE_QUEUE,
      defaultJobOptions: TOPIC_EVALUATE_JOB_OPTIONS,
    }),
    BullBoardModule.forFeature({
      name: TOPIC_EVALUATE_QUEUE,
      adapter: BullMQAdapter,
    }),
    TopicCandidateModule,
  ],
  providers: [TopicEvaluateProcessor, TopicEvaluateAiService],
})
export class TopicEvaluateModule {}
