import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopicCandidateEntity } from './topic-candidate.entity';
import { TopicCandidateService } from './topic-candidate.service';
import { TopicCandidateController } from './topic-candidate.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TopicCandidateEntity])],
  controllers: [TopicCandidateController],
  providers: [TopicCandidateService],
  exports: [TopicCandidateService],
})
export class TopicCandidateModule {}
