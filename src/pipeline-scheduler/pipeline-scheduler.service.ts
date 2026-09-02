import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DAILY_PIPELINE_RUN_JOB,
  DAILY_PIPELINE_SCHEDULER_ID,
  DEFAULT_DAILY_ARTICLES,
  DEFAULT_MIN_SCORE,
  DEFAULT_SCHEDULE_CRON,
  DEFAULT_SCHEDULE_TZ,
  PIPELINE_SCHEDULER_QUEUE,
} from './pipeline-scheduler.constants';

export interface PipelineSchedule {
  cron: string;
  timezone: string;
  minScore: number;
  dailyArticles: number;
  /** When the schedule fires next, or null if it is not registered */
  nextRunAt: string | null;
}

/** Reads a numeric setting, ignoring a value that is not a usable number */
function readNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(parsed)
    ? parsed
    : fallback;
}

@Injectable()
export class PipelineSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PipelineSchedulerService.name);

  constructor(
    @InjectQueue(PIPELINE_SCHEDULER_QUEUE)
    private readonly schedulerQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registers the schedule on every boot. Deliberately not wrapped in a catch:
   * a scheduler that quietly failed to register looks identical to one that has
   * simply not fired yet, and the container is restarted on a failed boot.
   */
  async onModuleInit(): Promise<void> {
    const { cron, timezone } = this.settings();

    await this.schedulerQueue.upsertJobScheduler(
      DAILY_PIPELINE_SCHEDULER_ID,
      { pattern: cron, tz: timezone },
      { name: DAILY_PIPELINE_RUN_JOB, data: {} },
    );

    this.logger.log(`Daily pipeline run scheduled at "${cron}" (${timezone})`);
  }

  settings(): Omit<PipelineSchedule, 'nextRunAt'> {
    return {
      cron: this.configService.get<string>(
        'PIPELINE_SCHEDULE_CRON',
        DEFAULT_SCHEDULE_CRON,
      ),
      timezone: this.configService.get<string>(
        'PIPELINE_SCHEDULE_TZ',
        DEFAULT_SCHEDULE_TZ,
      ),
      minScore: readNumber(
        this.configService.get<string>('PIPELINE_MIN_SCORE'),
        DEFAULT_MIN_SCORE,
      ),
      dailyArticles: readNumber(
        this.configService.get<string>('PIPELINE_DAILY_ARTICLES'),
        DEFAULT_DAILY_ARTICLES,
      ),
    };
  }

  /** What is configured, plus when it actually fires next */
  async describeSchedule(): Promise<PipelineSchedule> {
    const schedulers = await this.schedulerQueue.getJobSchedulers();
    const entry = schedulers.find(
      (scheduler) => scheduler.key === DAILY_PIPELINE_SCHEDULER_ID,
    );

    return {
      ...this.settings(),
      nextRunAt: entry?.next ? new Date(entry.next).toISOString() : null,
    };
  }

  /** Run the daily job now, without waiting for the schedule */
  async runNow(): Promise<{ jobId: string }> {
    const job = await this.schedulerQueue.add(DAILY_PIPELINE_RUN_JOB, {
      manual: true,
    });
    return { jobId: String(job.id) };
  }
}
