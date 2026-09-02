import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  PipelineSchedule,
  PipelineSchedulerService,
} from './pipeline-scheduler.service';

@Controller('pipeline-scheduler')
export class PipelineSchedulerController {
  constructor(private readonly schedulerService: PipelineSchedulerService) {}

  /** What is configured and when it fires next - the way to confirm the timezone */
  @Get('schedule')
  schedule(): Promise<PipelineSchedule> {
    return this.schedulerService.describeSchedule();
  }

  /** Run the daily job now, on the same path the schedule uses */
  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(): Promise<{ jobId: string }> {
    return this.schedulerService.runNow();
  }
}
