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
import { BlogCssService } from './blog-css.service';
import { CreateBlogCssDto } from './dto/create-blog-css.dto';
import { UpdateBlogCssDto } from './dto/update-blog-css.dto';

@Controller('blog-css')
export class BlogCssController {
  constructor(private readonly blogCssService: BlogCssService) {}

  @Post()
  create(@Body() dto: CreateBlogCssDto) {
    return this.blogCssService.create(dto);
  }

  @Get()
  findAll() {
    return this.blogCssService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogCssService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogCssDto,
  ) {
    return this.blogCssService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogCssService.remove(id);
  }
}
