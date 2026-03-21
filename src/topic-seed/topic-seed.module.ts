import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TopicSeedEntity } from './topic-seed.entity';
import { TopicSeedService } from './topic-seed.service';
import { TopicSeedController } from './topic-seed.controller';
import { TopicCandidateModule } from '../topic-candidate/topic-candidate.module';
import { TOPIC_GENERATE_QUEUE } from '../topic-generate/topic-generate.constants';
import { TOPIC_EVALUATE_QUEUE } from '../topic-evaluate/topic-evaluate.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([TopicSeedEntity]),
    BullModule.registerQueue({ name: TOPIC_GENERATE_QUEUE }),
    BullModule.registerQueue({ name: TOPIC_EVALUATE_QUEUE }),
    TopicCandidateModule,
  ],
  controllers: [TopicSeedController],
  providers: [TopicSeedService],
  exports: [TopicSeedService],
})
export class TopicSeedModule {}
