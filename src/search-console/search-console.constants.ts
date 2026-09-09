import { JobsOptions } from 'bullmq';

export const SEARCH_CONSOLE_QUEUE = 'search-console-sync';
export const SYNC_SEARCH_CONSOLE_JOB = 'sync-search-console';

/**
 * Key of the repeatable schedule. Upserting under the same id updates the
 * existing entry, so a changed cron replaces the old one instead of leaving two
 * schedules firing.
 */
export const SEARCH_CONSOLE_SCHEDULER_ID = 'search-console-sync';

/**
 * Retained as long as the pipeline scheduler's jobs and for the same reason:
 * with one run a day these are the record of what was collected while nobody
 * was watching, and a week would cover only the last seven of them.
 */
export const SEARCH_CONSOLE_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: { age: 7_776_000 }, // 90 days
  removeOnFail: { age: 7_776_000 },
};

/** 20:00, an hour before the pipeline run, so the day's data is already in */
export const DEFAULT_SYNC_CRON = '0 20 * * *';

/** The server runs on UTC; the schedule is meant in the author's own evening */
export const DEFAULT_SYNC_TZ = 'Asia/Seoul';

/** Length of the window asked for, in days */
export const DEFAULT_LOOKBACK_DAYS = 28;

/**
 * Search Console finalises a day's figures two to three days after the fact.
 * A window ending today therefore reads near-zero for its last days and drags
 * the average position with it, so the whole window is shifted back instead.
 */
export const DATA_LAG_DAYS = 3;

/**
 * "Striking distance": ranked well enough that another article on the subject
 * could plausibly push it onto the first page. Below the minimum the page has
 * already won and needs nothing; above the maximum it is too far back for one
 * more article to matter.
 */
export const STRIKING_DISTANCE_MIN = 8;
export const STRIKING_DISTANCE_MAX = 30;

/**
 * The API's own maximum. Nothing pages past it: this blog returns a few hundred
 * rows, so paging code would never run - and never-run code is never right when
 * it finally does. The processor logs a warning if a response comes back at
 * exactly this size, which is the only way truncation could show up.
 */
export const GSC_ROW_LIMIT = 25_000;

/** Rows per INSERT. Twelve columns x 500 stays well inside Postgres' limit */
export const UPSERT_CHUNK_SIZE = 500;
