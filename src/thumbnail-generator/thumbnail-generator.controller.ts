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
import { ThumbnailGeneratorService } from './thumbnail-generator.service';
import { GenerateThumbnailDto } from './dto/generate-thumbnail.dto';
import { QueryThumbnailPromptsDto } from './dto/query-thumbnail-prompts.dto';

@Controller('thumbnail-generator')
export class ThumbnailGeneratorController {
  constructor(private readonly service: ThumbnailGeneratorService) {}

  /** 프롬프트 저장 + 생성 job 등록 */
  @Post('generate')
  generate(@Body() dto: GenerateThumbnailDto) {
    return this.service.generate(dto);
  }

  /** 프롬프트 목록 */
  @Get('prompts')
  findAll(@Query() query: QueryThumbnailPromptsDto) {
    return this.service.findAll(query);
  }

  /** 프롬프트 상세 + status (FE 폴링용) */
  @Get('prompts/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /** 프롬프트에 연결된 이미지 목록 */
  @Get('prompts/:id/images')
  findImages(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findImages(id);
  }

  /** active 플래그 토글 */
  @Patch('mappings/:id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('active') active: boolean,
  ) {
    return this.service.setActive(id, active);
  }

  /** 프롬프트 삭제 */
  @Delete('prompts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
