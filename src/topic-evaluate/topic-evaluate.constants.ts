import { JobsOptions } from 'bullmq';

export const TOPIC_EVALUATE_QUEUE = 'topic-evaluate';
export const EVALUATE_TOPIC_CANDIDATES_JOB = 'evaluate-topic-candidates';

/**
 * Applied wherever this queue is registered. Each registration builds its own
 * Queue instance, so options set in only one module make a job's retention
 * depend on which module happened to enqueue it - the producers are spread
 * across topic-seed, topic-generate and topic-evaluate itself.
 */
export const TOPIC_EVALUATE_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: { age: 604_800 },
  removeOnFail: { age: 604_800 },
};
