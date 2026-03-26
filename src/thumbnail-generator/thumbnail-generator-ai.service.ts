import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Replicate from 'replicate';
import type { ThumbnailPromptMeta } from './entities/thumbnail-prompt.entity';

export interface ReplicateOutput {
  buffer: Buffer;
  mimeType: string;
}

@Injectable()
export class ThumbnailGeneratorAiService {
  private readonly logger = new Logger(ThumbnailGeneratorAiService.name);
  private readonly replicate: Replicate;

  constructor(private readonly configService: ConfigService) {
    this.replicate = new Replicate({
      auth: this.configService.get<string>('REPLICATE_API_TOKEN'),
    });
  }

  async generate(
    prompt: string,
    model: string,
    meta: ThumbnailPromptMeta | null,
  ): Promise<ReplicateOutput[]> {
    const numOutputs = meta?.num_outputs ?? 1;

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: meta?.aspect_ratio ?? '16:9',
      output_format: meta?.output_format ?? 'webp',
      output_quality: meta?.output_quality ?? 85,
      num_outputs: numOutputs,
    };

    this.logger.log(`Calling Replicate model: ${model}, outputs: ${numOutputs}`);

    const output = await this.replicate.run(model as `${string}/${string}`, { input });

    const items = Array.isArray(output) ? output : [output];
    const results: ReplicateOutput[] = [];

    for (const item of items) {
      // FileOutput has a url() method; fallback to toString()
      const url: string =
        typeof (item as any).url === 'function'
          ? (item as any).url().toString()
          : String(item);

      this.logger.log(`Downloading Replicate output: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download image from Replicate: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') ?? `image/${meta?.output_format ?? 'webp'}`;

      results.push({ buffer, mimeType });
    }

    return results;
  }
}
