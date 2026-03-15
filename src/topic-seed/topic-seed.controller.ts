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
import { TopicSeedService } from './topic-seed.service';
import { CreateTopicSeedDto } from './dto/create-topic-seed.dto';
import { UpdateTopicSeedDto } from './dto/update-topic-seed.dto';
import { ListTopicSeedQueryDto } from './dto/list-topic-seed-query.dto';

@Controller('topic-seeds')
export class TopicSeedController {
  constructor(private readonly topicSeedService: TopicSeedService) {}

  @Post()
  create(@Body() dto: CreateTopicSeedDto) {
    return this.topicSeedService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListTopicSeedQueryDto) {
    return this.topicSeedService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.topicSeedService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTopicSeedDto,
  ) {
    return this.topicSeedService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.topicSeedService.remove(id);
  }

  @Post(':id/generate')
  generate(@Param('id', ParseUUIDPipe) id: string) {
    return this.topicSeedService.generate(id);
  }
}
