import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { TopicService } from './topic.service';
import { TopicProcessor } from './topic.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'topic',
    }),
    BullBoardModule.forFeature({
      name: 'topic',
      adapter: BullMQAdapter,
    }),
  ],
  providers: [TopicService, TopicProcessor],
  exports: [TopicService],
})
export class TopicModule {}
