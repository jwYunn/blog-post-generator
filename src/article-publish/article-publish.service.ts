import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ARTICLE_PUBLISH_QUEUE, PUBLISH_ARTICLE_JOB } from './constants';
import { CreatePublishJobDto, PublishJobMode } from './dto/create-publish-job.dto';

@Injectable()
export class ArticlePublishService {
  constructor(
    @InjectQueue(ARTICLE_PUBLISH_QUEUE)
    private readonly publishQueue: Queue,
  ) {}

  async addPublishJob(articleDraftId: string, dto: CreatePublishJobDto): Promise<void> {
    await this.publishQueue.add(PUBLISH_ARTICLE_JOB, {
      articleDraftId,
      mode: dto.mode,
      scheduledAt: dto.scheduledAt,
    });
  }
}
