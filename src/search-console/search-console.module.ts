import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { SearchConsoleQueryEntity } from './search-console-query.entity';
import { SearchConsoleClient } from './search-console.client';
import { SearchConsoleController } from './search-console.controller';
import { SearchConsoleProcessor } from './search-console.processor';
import { SearchConsoleService } from './search-console.service';
import {
  SEARCH_CONSOLE_QUEUE,
  SEARCH_CONSOLE_JOB_OPTIONS,
} from './search-console.constants';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SearchConsoleQueryEntity]),
    BullModule.registerQueue({
      name: SEARCH_CONSOLE_QUEUE,
      defaultJobOptions: SEARCH_CONSOLE_JOB_OPTIONS,
    }),
    BullBoardModule.forFeature({
      name: SEARCH_CONSOLE_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [SearchConsoleController],
  providers: [
    SearchConsoleService,
    SearchConsoleClient,
    SearchConsoleProcessor,
  ],
})
export class SearchConsoleModule {}
