import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { TopicGenerateProcessor } from './topic-generate.processor';
import { TOPIC_GENERATE_QUEUE } from './topic-generate.constants';
import { TopicSeedModule } from '../topic-seed/topic-seed.module';
import { TopicCandidateModule } from '../topic-candidate/topic-candidate.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: TOPIC_GENERATE_QUEUE }),
    BullBoardModule.forFeature({ name: TOPIC_GENERATE_QUEUE, adapter: BullMQAdapter }),
    TopicSeedModule,
    TopicCandidateModule,
  ],
  providers: [TopicGenerateProcessor],
})
export class TopicGenerateModule {}
