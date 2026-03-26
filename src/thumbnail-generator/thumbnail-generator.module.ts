import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ConfigModule } from '@nestjs/config';
import { ThumbnailPromptEntity } from './entities/thumbnail-prompt.entity';
import { ThumbnailEntity } from './entities/thumbnail.entity';
import { ThumbnailPromptMappingEntity } from './entities/thumbnail-prompt-mapping.entity';
import { ThumbnailGeneratorController } from './thumbnail-generator.controller';
import { ThumbnailGeneratorService } from './thumbnail-generator.service';
import { ThumbnailGeneratorAiService } from './thumbnail-generator-ai.service';
import { ThumbnailGeneratorS3Service } from './thumbnail-generator-s3.service';
import { ThumbnailGeneratorProcessor } from './thumbnail-generator.processor';
import { THUMBNAIL_GENERATOR_QUEUE } from './thumbnail-generator.constants';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      ThumbnailPromptEntity,
      ThumbnailEntity,
      ThumbnailPromptMappingEntity,
    ]),
    BullModule.registerQueue({
      name: THUMBNAIL_GENERATOR_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 604_800 },
        removeOnFail: { age: 604_800 },
      },
    }),
    BullBoardModule.forFeature({
      name: THUMBNAIL_GENERATOR_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [ThumbnailGeneratorController],
  providers: [
    ThumbnailGeneratorService,
    ThumbnailGeneratorAiService,
    ThumbnailGeneratorS3Service,
    ThumbnailGeneratorProcessor,
  ],
})
export class ThumbnailGeneratorModule {}
