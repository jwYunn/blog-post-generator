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
} from '@nestjs/common';
import { ApiSourceService } from './api-source.service';
import { CreateApiSourceDto } from './dto/create-api-source.dto';
import { UpdateApiSourceDto } from './dto/update-api-source.dto';

@Controller('api-sources')
export class ApiSourceController {
  constructor(private readonly apiSourceService: ApiSourceService) {}

  @Post()
  create(@Body() dto: CreateApiSourceDto) {
    return this.apiSourceService.create(dto);
  }

  @Get()
  findAll() {
    return this.apiSourceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.apiSourceService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApiSourceDto,
  ) {
    return this.apiSourceService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.apiSourceService.remove(id);
  }
}
