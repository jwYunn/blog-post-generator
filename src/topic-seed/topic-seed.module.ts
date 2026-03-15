import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopicSeedEntity } from './topic-seed.entity';
import { TopicSeedService } from './topic-seed.service';
import { TopicSeedController } from './topic-seed.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TopicSeedEntity])],
  controllers: [TopicSeedController],
  providers: [TopicSeedService],
  exports: [TopicSeedService],
})
export class TopicSeedModule {}
