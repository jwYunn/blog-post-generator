import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ArticleDraftService } from './article-draft.service';
import { QueryArticleDraftListDto } from './dto/query-article-draft-list.dto';

@Controller()
export class ArticleDraftController {
  constructor(private readonly articleDraftService: ArticleDraftService) {}

  @Post('articles/from-candidate/:candidateId')
  createFromCandidate(
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
  ) {
    return this.articleDraftService.createFromCandidate(candidateId);
  }

  @Get('article-drafts')
  findAll(@Query() dto: QueryArticleDraftListDto) {
    return this.articleDraftService.findAll(dto);
  }

  @Get('article-drafts/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleDraftService.findOne(id);
  }
}
