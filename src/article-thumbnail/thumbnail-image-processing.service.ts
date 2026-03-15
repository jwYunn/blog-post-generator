import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as sharp from 'sharp';

@Injectable()
export class ThumbnailImageProcessingService {
  async processThumbnailFromUrl(imageUrl: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: 'arraybuffer',
    });

    const inputBuffer = Buffer.from(response.data);

    const outputBuffer = await sharp(inputBuffer)
      .resize(1024, 1024, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    return outputBuffer;
  }
}
