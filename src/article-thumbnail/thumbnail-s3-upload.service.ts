import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class ThumbnailS3UploadService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | undefined;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? 'ap-northeast-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET ?? '';
    this.publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL;
  }

  async uploadThumbnail(
    articleDraftId: string,
    fileBuffer: Buffer,
  ): Promise<string> {
    const key = `thumbnails/${articleDraftId}.webp`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: 'image/webp',
      }),
    );

    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }

    const region = process.env.AWS_REGION ?? 'ap-northeast-2';
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
