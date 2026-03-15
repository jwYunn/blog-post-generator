import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TopicSeedEntity } from './topic-seed.entity';
import { TopicSeedService } from './topic-seed.service';
import { TopicSeedController } from './topic-seed.controller';
import { TOPIC_GENERATE_QUEUE } from '../topic-generate/topic-generate.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([TopicSeedEntity]),
    BullModule.registerQueue({ name: TOPIC_GENERATE_QUEUE }),
  ],
  controllers: [TopicSeedController],
  providers: [TopicSeedService],
  exports: [TopicSeedService],
})
export class TopicSeedModule {}
