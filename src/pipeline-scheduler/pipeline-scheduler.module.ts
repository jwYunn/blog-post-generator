import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { TopicCandidateModule } from '../topic-candidate/topic-candidate.module';
import { TopicSeedModule } from '../topic-seed/topic-seed.module';
import { TOPIC_GENERATE_QUEUE } from '../topic-generate/topic-generate.constants';
import {
  TOPIC_EVALUATE_QUEUE,
  TOPIC_EVALUATE_JOB_OPTIONS,
} from '../topic-evaluate/topic-evaluate.constants';
import { PipelineSchedulerController } from './pipeline-scheduler.controller';
import { PipelineSchedulerProcessor } from './pipeline-scheduler.processor';
import { PipelineSchedulerService } from './pipeline-scheduler.service';
import {
  PIPELINE_SCHEDULER_QUEUE,
  PIPELINE_SCHEDULER_JOB_OPTIONS,
} from './pipeline-scheduler.constants';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: PIPELINE_SCHEDULER_QUEUE,
      defaultJobOptions: PIPELINE_SCHEDULER_JOB_OPTIONS,
    }),
    // Producer only - the workers for both live in their own modules
    BullModule.registerQueue({ name: TOPIC_GENERATE_QUEUE }),
    BullModule.registerQueue({
      name: TOPIC_EVALUATE_QUEUE,
      defaultJobOptions: TOPIC_EVALUATE_JOB_OPTIONS,
    }),
    BullBoardModule.forFeature({
      name: PIPELINE_SCHEDULER_QUEUE,
      adapter: BullMQAdapter,
    }),
    TopicCandidateModule,
    TopicSeedModule,
  ],
  controllers: [PipelineSchedulerController],
  providers: [PipelineSchedulerProcessor, PipelineSchedulerService],
})
export class PipelineSchedulerModule {}
