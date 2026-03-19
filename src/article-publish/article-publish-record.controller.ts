import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ArticlePublishRecordService } from './article-publish-record.service';
import { QueryPublishRecordListDto } from './dto/query-publish-record-list.dto';

@Controller()
export class ArticlePublishRecordController {
  constructor(private readonly recordService: ArticlePublishRecordService) {}

  @Get('article-publish-records')
  findAll(@Query() dto: QueryPublishRecordListDto) {
    return this.recordService.findAll(dto);
  }

  @Get('article-publish-records/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.recordService.findOne(id);
  }

  @Get('article-drafts/:draftId/publish-records')
  findByDraftId(
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Query() dto: QueryPublishRecordListDto,
  ) {
    return this.recordService.findByDraftId(draftId, dto);
  }
}
