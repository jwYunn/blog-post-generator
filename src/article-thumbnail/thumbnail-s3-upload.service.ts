import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const DEFAULT_REGION = 'ap-northeast-2';

@Injectable()
export class ThumbnailS3UploadService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl: string | undefined;

  constructor(configService: ConfigService) {
    this.region = configService.get<string>('AWS_REGION', DEFAULT_REGION);
    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
    this.bucket = configService.get<string>('AWS_S3_BUCKET', '');
    this.publicBaseUrl = configService.get<string>('AWS_S3_PUBLIC_BASE_URL');
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

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
