import { Job } from 'bullmq';

/**
 * Writes to a job's own log, which BullMQ keeps in Redis alongside the job and
 * Bull Board renders when the job is opened.
 *
 * This is deliberately separate from the Nest logger. Container logs roll over
 * (`max-size: 10m`, three files), and by the time anyone opens a failed job the
 * lines that explain it are usually gone - while the job itself is retained for
 * a week. Whatever a person would need to understand the run belongs here.
 */

/** Seconds since the worker picked the job up, for spotting the slow step */
function elapsed(job: Job): string {
  if (!job.processedOn) return '';
  return `+${((Date.now() - job.processedOn) / 1000).toFixed(1)}s `;
}

/**
 * Append one line to the job log. Never throws: these lines are diagnostics,
 * and losing one must not fail the job - least of all from inside a catch,
 * where it would replace the error actually worth reporting.
 */
export async function jobLog(job: Job, message: string): Promise<void> {
  try {
    await job.log(`${elapsed(job)}${message}`);
  } catch {
    // Redis backs the queue itself; if it will not take a log line, that will
    // surface on its own through the job failing.
  }
}

/**
 * Append a line and move the progress bar. Use at stage boundaries, so an
 * in-flight job shows how far it has got without anyone reading the log.
 */
export async function jobStep(
  job: Job,
  progress: number,
  message: string,
): Promise<void> {
  await jobLog(job, message);
  try {
    await job.updateProgress(progress);
  } catch {
    // Same reasoning as jobLog
  }
}

/** Record why a job failed on the job itself, before the error is rethrown */
export async function jobFailed(job: Job, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await jobLog(job, `FAILED: ${message.split('\n')[0]}`);
}
