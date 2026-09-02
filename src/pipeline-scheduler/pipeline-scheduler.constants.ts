import { JobsOptions } from 'bullmq';

export const PIPELINE_SCHEDULER_QUEUE = 'pipeline-scheduler';
export const DAILY_PIPELINE_RUN_JOB = 'daily-pipeline-run';

/**
 * Key of the repeatable schedule. Upserting under the same id updates the
 * existing entry, so a changed cron replaces the old one instead of leaving two
 * schedules firing.
 */
export const DAILY_PIPELINE_SCHEDULER_ID = 'daily-pipeline-run';

/**
 * Retained far longer than the other queues: with one run a day, these jobs are
 * the record of what the pipeline decided while nobody was watching, and a week
 * would cover only the last seven of them.
 */
export const PIPELINE_SCHEDULER_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: { age: 7_776_000 }, // 90 days
  removeOnFail: { age: 7_776_000 },
};

/** 05:00, every day */
export const DEFAULT_SCHEDULE_CRON = '0 5 * * *';

/** The server runs on UTC; the schedule is meant in the author's own morning */
export const DEFAULT_SCHEDULE_TZ = 'Asia/Seoul';

/** Only candidates scoring at least this much are written up unattended */
export const DEFAULT_MIN_SCORE = 7;

/** Articles started per run */
export const DEFAULT_DAILY_ARTICLES = 1;

/**
 * Below this many usable candidates a run tops the pool up. Sized so a refill
 * lands well before the pool can empty at one article a day.
 */
export const POOL_LOW_WATER_MARK = 10;
