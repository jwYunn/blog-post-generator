import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiSourceEntity } from './api-source.entity';
import { ApiSourceService } from './api-source.service';
import { ApiSourceController } from './api-source.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiSourceEntity])],
  controllers: [ApiSourceController],
  providers: [ApiSourceService],
})
export class ApiSourceModule {}
