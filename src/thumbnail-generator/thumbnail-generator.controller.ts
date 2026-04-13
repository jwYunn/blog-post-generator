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

  /** Save prompt and enqueue generation job */
  @Post('generate')
  generate(@Body() dto: GenerateThumbnailDto) {
    return this.service.generate(dto);
  }

  /** List all prompts */
  @Get('prompts')
  findAll(@Query() query: QueryThumbnailPromptsDto) {
    return this.service.findAll(query);
  }

  /** Get prompt detail with status (used for FE polling) */
  @Get('prompts/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /** Get generated images for a prompt */
  @Get('prompts/:id/images')
  findImages(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findImages(id);
  }

  /** Toggle active flag on a mapping */
  @Patch('mappings/:id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('active') active: boolean,
  ) {
    return this.service.setActive(id, active);
  }

  /** Delete a prompt */
  @Delete('prompts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
