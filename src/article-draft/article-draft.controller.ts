import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ArticleDraftService } from './article-draft.service';

@Controller()
export class ArticleDraftController {
  constructor(private readonly articleDraftService: ArticleDraftService) {}

  @Post('articles/from-candidate/:candidateId')
  createFromCandidate(
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ) {
    return this.articleDraftService.createFromCandidate(candidateId);
  }

  @Get('article-drafts/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleDraftService.findOne(id);
  }
}
