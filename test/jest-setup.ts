import { Logger } from '@nestjs/common';

/**
 * Processors and AI services log at normal operating volume, which in a test
 * run is a few hundred lines sitting between the failure someone opened CI to
 * read and the summary at the bottom. Silencing it here keeps that out of every
 * suite rather than stubbing the logger in each one.
 *
 * Assertions about what a job recorded read the job's own log, not this - see
 * src/common/queue/job-log.util.ts.
 */
Logger.overrideLogger(false);
