import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TopicService {
  constructor(@InjectQueue('topic') private readonly topicQueue: Queue) {}
}
