import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  ThumbnailGeneratorService,
  GenerateThumbnailJobPayload,
} from './thumbnail-generator.service';
import { ThumbnailGeneratorAiService } from './thumbnail-generator-ai.service';
import { ThumbnailGeneratorS3Service } from './thumbnail-generator-s3.service';
import { THUMBNAIL_GENERATOR_QUEUE } from './thumbnail-generator.constants';
import { jobFailed, jobLog, jobStep } from '../common/queue/job-log.util';

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
      // Truncated: a prompt can run long, and the first line is what identifies it
      await jobStep(
        job,
        10,
        `prompt ${promptId} on ${prompt.model} - "${prompt.prompt.slice(0, 120)}"`,
      );

      await jobStep(job, 20, 'calling replicate');
      const outputs = await this.aiService.generate(
        prompt.prompt,
        prompt.model,
        prompt.meta,
      );
      await jobStep(job, 50, `replicate returned ${outputs.length} image(s)`);

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
        // Spread across the upload phase so a stalled batch shows which image
        await jobStep(
          job,
          50 + Math.round(((i + 1) / outputs.length) * 45),
          `image ${i + 1}/${outputs.length} (${buffer.length} bytes) -> ${s3Url}`,
        );
      }

      await this.thumbnailGeneratorService.updatePromptStatus(promptId, 'done');
      await jobStep(job, 100, `done - ${outputs.length} image(s) stored`);
      this.logger.log(`Thumbnail job done for prompt #${promptId}`);
    } catch (error) {
      await jobFailed(job, error);
      await jobLog(job, `prompt ${promptId} marked failed`);
      this.logger.error(`Thumbnail job failed for prompt #${promptId}`, error);
      await this.thumbnailGeneratorService.updatePromptStatus(
        promptId,
        'failed',
      );
      throw error;
    }
  }
}
