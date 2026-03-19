import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogCssEntity } from './blog-css.entity';
import { BlogCssService } from './blog-css.service';
import { BlogCssController } from './blog-css.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BlogCssEntity])],
  controllers: [BlogCssController],
  providers: [BlogCssService],
  exports: [BlogCssService],
})
export class BlogCssModule {}
