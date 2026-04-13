import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ThumbnailGeneratorService, GenerateThumbnailJobPayload } from './thumbnail-generator.service';
import { ThumbnailGeneratorAiService } from './thumbnail-generator-ai.service';
import { ThumbnailGeneratorS3Service } from './thumbnail-generator-s3.service';
import { THUMBNAIL_GENERATOR_QUEUE } from './thumbnail-generator.constants';

@Processor(THUMBNAIL_GENERATOR_QUEUE, { concurrency: 2 })
export class ThumbnailGeneratorProcessor extends WorkerHost {
  private readonly logger = new Logger(ThumbnailGeneratorProcessor.name);

  constructor(
    private readonly thumbnailGeneratorService: ThumbnailGeneratorService,
    private readonly aiService: ThumbnailGeneratorAiService,
    private readonly s3Service: ThumbnailGeneratorS3Service,
  ) {
    super();
  }

  async process(job: Job<GenerateThumbnailJobPayload>): Promise<void> {
    const { promptId } = job.data;

    const prompt = await this.thumbnailGeneratorService.findOne(promptId);
    this.logger.log(`Processing thumbnail job for prompt #${promptId}`);

    try {
      const outputs = await this.aiService.generate(
        prompt.prompt,
        prompt.model,
        prompt.meta,
      );

      for (let i = 0; i < outputs.length; i++) {
        const { buffer, mimeType } = outputs[i];

        // Generate a temp UUID for the S3 key before the thumbnail entity is saved
        const tempId = crypto.randomUUID();
        const s3Url = await this.s3Service.upload(tempId, buffer, mimeType);

        await this.thumbnailGeneratorService.saveThumbnailAndMapping(
          promptId,
          s3Url,
          mimeType,
          i + 1,
        );

        this.logger.log(`Thumbnail #${i + 1} uploaded: ${s3Url}`);
      }

      await this.thumbnailGeneratorService.updatePromptStatus(promptId, 'done');
      this.logger.log(`Thumbnail job done for prompt #${promptId}`);
    } catch (error) {
      this.logger.error(`Thumbnail job failed for prompt #${promptId}`, error);
      await this.thumbnailGeneratorService.updatePromptStatus(promptId, 'failed');
      throw error;
    }
  }
}
