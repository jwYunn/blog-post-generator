# Queue & Job Reference

All queues use **BullMQ** backed by Redis. The Bull Board dashboard is available at `/queues`.

## Queue Summary

| Queue Name | Job Name | Processor | Concurrency | Trigger |
|---|---|---|---|---|
| `topic-generate` | `generate-topic-candidates` | `TopicGenerateProcessor` | default | `POST /topic-seeds/:id/generate` |
| `topic-evaluate` | `evaluate-topic-candidates` | `TopicEvaluateProcessor` | default | `POST /topic-seeds/:id/evaluate` |
| `article-outline` | `generate-article-outline` | `ArticleOutlineProcessor` | 3 | Candidate approval (auto-chained) |
| `article-content` | `generate-article-content` | `ArticleContentProcessor` | 3 | Auto-chained after outline |
| `article-thumbnail` | `generate-article-thumbnail` | `ArticleThumbnailProcessor` | 1 | Auto-chained after content |
| `article-publish` | `publish-article` | `ArticlePublishProcessor` | 1 | `POST /article-drafts/:id/publish` |
| `thumbnail-generator` | `generate-thumbnail` | `ThumbnailGeneratorProcessor` | 2 | `POST /thumbnail-generator/generate` |
| `pipeline-scheduler` | `daily-pipeline-run` | `PipelineSchedulerProcessor` | 1 | Repeatable schedule, or `POST /pipeline-scheduler/run` |

---

## topic-generate

**Queue**: `topic-generate`
**Job**: `generate-topic-candidates`

### Payload
```typescript
{
  seedId: string  // UUID of TopicSeed
}
```

### Processor Steps
1. Fetch `TopicSeed` by `seedId`
2. Call `TopicGenerateAiService.generateCandidates(seed.seed)` → array of candidate payloads
3. Call `TopicCandidateService.saveMany(seedId, candidates)` → bulk insert (skip duplicates)
4. Call `TopicSeedService.incrementUsedCount(seedId)`

### Output
Creates N `TopicCandidate` rows (status=`pending`) linked to the seed.

---

## topic-evaluate

**Queue**: `topic-evaluate`
**Job**: `evaluate-topic-candidates`

### Payload
```typescript
{
  seedId: string   // UUID of TopicSeed
  scope?: 'pending' | 'all'   // defaults to 'pending'
}
```

`scope` decides which candidates are scored. **`pending` is the default and
almost always what you want**: approved and rejected candidates have already
been decided, so re-scoring them overwrites the numbers behind that decision —
a published article's source candidate can come back ranked last or marked
`drop` — and costs a model call per candidate on every run. Scoring the whole
seed grew steadily more expensive the longer the seed had been in use, which
stopped being tolerable once generation started chaining into evaluation.

`all` re-scores everything on the seed and exists for one case: the rubric
changed and old numbers are no longer comparable. Only the manual endpoint can
ask for it, via `?scope=all`.

### Processor Steps
1. Fetch the seed's `TopicCandidate` rows in `scope` (`pending` unless told otherwise)
2. Build candidate input array with: id, title, keyword, searchIntent, targetReader, whyThisTopic, outlinePreview
3. Call `TopicEvaluateAiService.evaluateCandidates(candidates)` → evaluation results
4. Call `TopicCandidateService.saveEvaluations(evaluations)` → bulk update

### Output
Updates each `TopicCandidate` with: `overallScore`, `rank`, `strengths`, `weaknesses`, `verdict`, `evaluationDetail`.

---

## article-outline

**Queue**: `article-outline`
**Job**: `generate-article-outline`

### Payload
```typescript
{
  articleDraftId: string  // UUID of ArticleDraft
}
```

### Processor Steps
1. Fetch `ArticleDraft` with relation `topicCandidate`
2. Set draft `status = generating_outline`
3. Call `ArticleOutlineAiService.generateOutline(title, keyword, searchIntent, targetReader, outlinePreview)`
4. Save outline JSON to `draft.outline`, set `status = outline_generated`
5. Enqueue `generate-article-content` job with `articleDraftId`
6. On error: set `status = failed`, save `errorMessage`

### Output
Saves `ArticleOutline` object to `draft.outline`:
```typescript
{
  title: string
  keyword: string
  searchIntent: string
  sections: string[]   // exactly 3 items, in Korean
  faqs: string[]       // 1–2 items, in Korean
}
```

---

## article-content

**Queue**: `article-content`
**Job**: `generate-article-content`

### Payload
```typescript
{
  articleDraftId: string  // UUID of ArticleDraft
}
```

### Processor Steps
1. Fetch `ArticleDraft`
2. Validate `draft.outline` exists
3. Set `status = generating_content`
4. In parallel:
   - `ArticleContentAiService.generateContent(title, keyword, outline)` → markdown string
   - `ArticleContentAiService.generateHashtags(title, keyword)` → string[]
5. Save `draft.content` and `draft.hashtags`, set `status = content_generated`
6. Enqueue `generate-article-thumbnail` job
7. On error: set `status = failed`, save `errorMessage`

---

## article-thumbnail

**Queue**: `article-thumbnail`
**Job**: `generate-article-thumbnail`

### Payload
```typescript
{
  articleDraftId: string  // UUID of ArticleDraft
}
```

### Processor Steps
1. Fetch `ArticleDraft`
2. Set `status = generating_thumbnail`
3. Strip category prefix from title via `stripTitleCategory(draft.title)`
4. Call `ThumbnailImageProcessingService.processThumbnailWithText(strippedTitle)` → Buffer
5. Upload buffer to S3 via `ThumbnailS3UploadService.upload(articleDraftId, buffer)`
6. Save S3 URL to `draft.thumbnailImageUrl`, set `status = review_ready`
7. On error: set `status = failed`, save `errorMessage`

**Note**: Concurrency is 1 because Sharp image processing is CPU-intensive.

---

## article-publish

**Queue**: `article-publish`
**Job**: `publish-article`

### Payload
```typescript
{
  articleDraftId: string
  publishRecordId: string  // attempt record created by ArticlePublishService
  mode: 'now' | 'schedule'
  scheduledAt?: string  // ISO 8601 datetime string, required if mode='schedule'
}
```

The `ArticlePublishRecord` is created by `ArticlePublishService.addPublishJob`
**before** the job is queued, with `status = attempting` and the target
`blogName`. The processor updates that row rather than creating one.

### Processor Steps
1. Fetch the `ArticlePublishRecord` named by the payload
2. Fetch `ArticleDraft` with all relations
3. Validate `draft.content` exists
4. Set draft `status = publishing`
5. Load `KAKAO_ID` and `KAKAO_PASSWORD` from env via `ConfigService`; take
   `blogName` from the record, falling back to `TISTORY_BLOG_NAME`
6. Call `runTistoryPublish()` via `TistorySessionService` (Playwright automation),
   passing `onBeforePublish` to mark the point past which a post may exist
7. Set draft `status = published`; set record `status = published` + `permalink`
8. On error: set draft `status = failed`, save `errorMessage`, and set record
   `status = failed` **only** if `onBeforePublish` never fired. Otherwise the
   record stays `attempting` for a human to resolve

**Note**: Concurrency is 1 to avoid Tistory rate limiting / session conflicts.

---

## thumbnail-generator

**Queue**: `thumbnail-generator`
**Job**: `generate-thumbnail`

### Payload
```typescript
{
  promptId: string  // UUID of ThumbnailPrompt
}
```

### Processor Steps
1. Fetch `ThumbnailPromptEntity` by `promptId`
2. Call `ThumbnailGeneratorAiService.generate(prompt.prompt, prompt.model, prompt.meta)` → array of outputs
3. For each output (image buffer + mimeType):
   a. Generate a temp UUID as S3 key
   b. Upload buffer to S3 via `ThumbnailGeneratorS3Service`
   c. Call `ThumbnailGeneratorService.saveThumbnailAndMapping(promptId, s3Url, mimeType, rank)`
4. Call `ThumbnailGeneratorService.updatePromptStatus(promptId, 'done')`
5. On error: call `updatePromptStatus(promptId, 'failed')`

### Output
Creates `Thumbnail` rows and `ThumbnailPromptMapping` rows linking the prompt to each generated image.

---

## pipeline-scheduler

**Queue**: `pipeline-scheduler`
**Job**: `daily-pipeline-run`

Registered as a BullMQ job scheduler on every boot, defaulting to `0 5 * * *` in
`Asia/Seoul`. Registration is an upsert under a fixed id, so changing the cron
replaces the schedule rather than leaving two of them firing. Jobs here are kept
for 90 days rather than the usual 7: at one run a day they are the record of what
the pipeline chose while nobody was watching.

### Payload
```typescript
{
  manual?: boolean   // set when a person triggered the run
}
```

### Processor Steps
1. Read the settings (`PIPELINE_*` env, see below)
2. For each article the settings allow: take the highest-scoring **pending**
   candidate at or above `PIPELINE_MIN_SCORE` and approve it — approval creates
   the draft and enqueues `article-outline`, so the article writes itself from
   there and the run does not wait for it
3. Count what is left in the pool
4. If the pool is below `POOL_LOW_WATER_MARK`, top it up: enqueue
   `topic-evaluate` for a seed holding unscored candidates, or `topic-generate`
   for the next seed in rotation when no such backlog is left

### Why it draws from the pool

Generation returns ten candidates and a run consumes one, so generating every
morning would grow the backlog by nine a day. Drawing from what is already
scored keeps a run cheap — most days it costs nothing but a few queries — and
tops up only when the pool actually thins.

### Which candidate gets picked

Highest score wins, but seeds that produced an article in the last seven days
are ranked below those that did not. Candidates from one seed are all scored in
the same run and cluster around the same number, so score alone would let a
single seed supply several days running — repetitive to read, and those articles
would compete with each other for the same query. The rest breaks towards the
least recently used seed. It is an ordering, not a filter: a pool made entirely
of recent seeds still yields its best candidate.

### Settings

| Variable | Default | Meaning |
|---|---|---|
| `PIPELINE_SCHEDULE_CRON` | `0 5 * * *` | When the run fires |
| `PIPELINE_SCHEDULE_TZ` | `Asia/Seoul` | Container clocks are UTC, so this matters |
| `PIPELINE_MIN_SCORE` | `7` | Out of 10. Below it, nothing is written |
| `PIPELINE_DAILY_ARTICLES` | `1` | Articles started per run |

---

## Queue Chaining (Auto-enqueue)

The article generation pipeline is chained: each processor enqueues the next job upon success.

```
article-outline processor
  → on success → enqueue article-content

article-content processor
  → on success → enqueue article-thumbnail

article-thumbnail processor
  → on success → (no auto-chain; draft enters review_ready for manual publish)
```

```
topic-generate processor
  → on success → enqueue topic-evaluate (scope: pending)
```

`topic-generate` chains **unconditionally**, including when every candidate it
generated was a duplicate and nothing was saved. Evaluation scores whatever is
still pending, so the chain doubles as the recovery path for candidates an
earlier failed evaluation left unscored; with nothing pending the job says so
and returns, at the cost of one query.

`POST /topic-seeds/:id/evaluate` stays for re-running an evaluation without
regenerating — and is the only way to pass `scope=all`.
