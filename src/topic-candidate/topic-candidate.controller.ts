import { Controller, Get, Query } from '@nestjs/common';
import { TopicCandidateService } from './topic-candidate.service';
import { QueryTopicCandidateListDto } from './dto/query-topic-candidate-list.dto';

@Controller('topic-candidates')
export class TopicCandidateController {
  constructor(private readonly topicCandidateService: TopicCandidateService) {}

  @Get()
  findAll(@Query() dto: QueryTopicCandidateListDto) {
    return this.topicCandidateService.findAll(dto);
  }
}
