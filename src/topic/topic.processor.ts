import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('topic')
export class TopicProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    // TODO: implement topic generation logic
  }
}
