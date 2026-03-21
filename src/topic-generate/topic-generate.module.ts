import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { TopicGenerateProcessor } from './topic-generate.processor';
import { TopicGenerateAiService } from './topic-generate-ai.service';
import { TOPIC_GENERATE_QUEUE } from './topic-generate.constants';
import { TOPIC_EVALUATE_QUEUE } from '../topic-evaluate/topic-evaluate.constants';
import { TopicSeedModule } from '../topic-seed/topic-seed.module';
import { TopicCandidateModule } from '../topic-candidate/topic-candidate.module';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: TOPIC_GENERATE_QUEUE }),
    // Producer-only registration for the evaluate queue
    BullModule.registerQueue({ name: TOPIC_EVALUATE_QUEUE }),
    BullBoardModule.forFeature({ name: TOPIC_GENERATE_QUEUE, adapter: BullMQAdapter }),
    TopicSeedModule,
    TopicCandidateModule,
  ],
  providers: [TopicGenerateProcessor, TopicGenerateAiService],
})
export class TopicGenerateModule {}
