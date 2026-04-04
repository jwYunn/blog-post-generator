# Queue Processing

This system uses **BullMQ** backed by **Redis 7** for all asynchronous processing. Every long-running or external API operation runs as a queue job — never inline in an HTTP request handler.

---

## Queue Inventory

| Queue Name | Job Type | Processor | Concurrency |
|---|---|---|---|
| `topic-generate` | `generate-topic-candidates` | `TopicGenerateProcessor` | default (1) |
| `topic-evaluate` | `evaluate-topic-candidates` | `TopicEvaluateProcessor` | default (1) |
| `article-outline` | `generate-article-outline` | `ArticleOutlineProcessor` | 3 |
| `article-content` | `generate-article-content` | `ArticleContentProcessor` | 3 |
| `article-thumbnail` | `generate-article-thumbnail` | `ArticleThumbnailProcessor` | 1 |
| `article-publish` | `publish-article` | `ArticlePublishProcessor` | 1 |
| `thumbnail-generator` | `generate-thumbnail` | `ThumbnailGeneratorProcessor` | default (1) |

---

## Concurrency Design

Concurrency is set intentionally per queue based on the nature of each job:

**`article-outline` and `article-content` — concurrency 3**
These are pure API calls (OpenAI, Anthropic). They're I/O bound with no shared state. Allowing 3 concurrent jobs improves throughput when multiple drafts are queued simultaneously, without risking rate limit collisions.

**`article-thumbnail` — concurrency 1**
Sharp image processing is CPU-bound. A single concurrent worker prevents resource contention and keeps memory usage predictable.

**`article-publish` — concurrency 1**
Playwright launches a real Chromium browser session and authenticates with Kakao (mobile auth). Concurrent sessions would conflict with login state. Serializing these jobs is a correctness requirement, not a performance choice.

---

## Job Lifecycle

Each job follows this lifecycle in BullMQ:

```
waiting → active → completed
                 → failed (retryable or dead-letter)
```

**Removal policy** (applied globally):
- Completed jobs: retained for 7 days (604,800 seconds), then auto-removed
- Failed jobs: retained for 7 days, then auto-removed

This keeps Redis memory bounded while leaving a sufficient window for debugging.

---

## Processor Pattern

All processors extend NestJS's `WorkerHost` and implement `process(job: Job)`:

```typescript
@Processor(QUEUE_NAME)
export class ExampleProcessor extends WorkerHost {
  async process(job: Job<JobPayload>): Promise<void> {
    const { draftId } = job.data;

    try {
      await this.draftService.setStatus(draftId, 'generating_x');

      const result = await this.aiService.call(/* ... */);

      await this.draftService.saveResult(draftId, result);
      await this.draftService.setStatus(draftId, 'x_generated');

      await this.nextQueue.add(NEXT_JOB, { draftId });
    } catch (err) {
      await this.draftService.setFailed(draftId, err.message);
      throw err; // re-throw so BullMQ records the failure
    }
  }
}
```

Key conventions:
- Status is set to `generating_*` at the start (signals in-progress to the frontend)
- On success, status is advanced and the next job is enqueued
- On failure, status is set to `failed` with the error message, then the exception is re-thrown
- Re-throwing ensures BullMQ marks the job as failed and records it in Redis

---

## Error Handling

**Database record**: `article_drafts.errorMessage` stores the failure reason (truncated to 500 chars). The admin UI surfaces this directly on the draft detail page.

**BullMQ record**: Failed jobs remain in Redis for 7 days. They're inspectable via Bull Board at `/queues`, which shows the full stack trace, job payload, and failure timestamp.

**No automatic retry** is configured by default. Retries would re-run AI API calls without context on why the previous attempt failed, which could amplify costs or produce duplicate data. Retries are handled manually via the admin UI if needed.

---

## Queue Monitoring

Bull Board provides a web UI at `/queues` (mounted in `AppModule`):

- View all queues and their job counts (waiting / active / completed / failed)
- Inspect individual job payloads and results
- Manually retry failed jobs
- Clear completed or failed job lists

Access is unrestricted in development. In production, this route should be protected behind authentication.

---

## Redis Configuration

Redis connection is configured in `src/config/bull.config.ts` using `REDIS_HOST` and `REDIS_PORT` environment variables. The same Redis instance is shared across all queues.

```typescript
// src/config/bull.config.ts
{
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  }
}
```

BullMQ stores job data, state, and history in Redis. No Redis persistence configuration is required beyond the default — job data is considered ephemeral; the source of truth is always PostgreSQL.
