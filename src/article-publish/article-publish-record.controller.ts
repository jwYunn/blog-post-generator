import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ArticlePublishRecordService } from './article-publish-record.service';
import { QueryPublishRecordListDto } from './dto/query-publish-record-list.dto';
import { CreatePublishRecordDto } from './dto/create-publish-record.dto';
import { UpdatePublishRecordDto } from './dto/update-publish-record.dto';

@Controller()
export class ArticlePublishRecordController {
  constructor(private readonly recordService: ArticlePublishRecordService) {}

  // ─── 조회 ──────────────────────────────────────────────────────────────────

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

  // ─── 수정 ──────────────────────────────────────────────────────────────────

  @Post('article-publish-records')
  create(@Body() dto: CreatePublishRecordDto) {
    return this.recordService.create(dto);
  }

  @Patch('article-publish-records/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePublishRecordDto,
  ) {
    return this.recordService.update(id, dto);
  }

  @Delete('article-publish-records/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.recordService.remove(id);
  }
}
