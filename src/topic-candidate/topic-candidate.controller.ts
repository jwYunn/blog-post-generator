import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { TopicCandidateService } from './topic-candidate.service';
import { QueryTopicCandidateListDto } from './dto/query-topic-candidate-list.dto';
import { UpdateTopicCandidateStatusDto } from './dto/update-topic-candidate-status.dto';

@Controller('topic-candidates')
export class TopicCandidateController {
  constructor(private readonly topicCandidateService: TopicCandidateService) {}

  @Get()
  findAll(@Query() dto: QueryTopicCandidateListDto) {
    return this.topicCandidateService.findAll(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTopicCandidateStatusDto,
  ) {
    return this.topicCandidateService.updateStatus(id, dto);
  }
}
