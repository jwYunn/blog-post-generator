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
| `search-console-sync` | `sync-search-console` | `SearchConsoleProcessor` | 1 | Repeatable schedule, or `POST /search-console/sync` |

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
3. Log how the batch split by depth — all one way means the model is not choosing
4. Call `TopicCandidateService.saveMany(seedId, candidates)` → bulk insert (skip duplicates)
5. Call `TopicSeedService.incrementUsedCount(seedId)`

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
2. Build candidate input array with: id, title, keyword, searchIntent, targetReader, depth, whyThisTopic, outlinePreview
3. Fetch the titles this seed has already been turned into articles under
4. Call `TopicEvaluateAiService.evaluateCandidates(candidates, coveredTitles)` → evaluation results
5. Call `TopicCandidateService.saveEvaluations(evaluations)` → bulk update

### Scoring against what the seed already covers

`uniqueness` judges a candidate against the other candidates in its batch **and**
against the articles the seed has already produced. Without the second half the
same search intent gets covered twice, months apart, and the two posts compete
for one query instead of adding up — the weaker one is what search engines drop.

"Covered" is wider than "published" on purpose: the scheduler commits one
candidate a day while the articles it starts sit waiting for review, so counting
only live posts would let three near-identical topics be written before the
first went up. Failed drafts are excluded, since nothing was produced. The
category prefix is stripped from the titles — it says nothing about whether two
topics overlap.

A different angle on the same word is not penalised when it answers a different
question; two phrasings of the same question are.

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
3. Resolve the candidate's depth — null or unknown is standard, and the log says
   when it was not set
4. Call `ArticleOutlineAiService.generateOutline({ title, keyword, searchIntent, targetReader, outlinePreview, depth })`
5. Log a warning when the section count falls outside the depth's range — the
   article is still written, but a model ignoring depth is what would cram it
6. Save outline JSON with `depth` added to `draft.outline`, set `status = outline_generated`
7. Enqueue `generate-article-content` job with `articleDraftId`
8. On error: set `status = failed`, save `errorMessage`

### Output
Saves `ArticleOutline` object to `draft.outline`:
```typescript
{
  title: string
  keyword: string
  searchIntent: string
  sections: string[]   // 1–2 for brief, 3 for standard, in Korean
  faqs: string[]       // 0–1 for brief, 1–2 for standard, in Korean
  depth: ArticleDepth  // the depth it was built for
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
3. Take depth from the outline (absent → standard), and with it the target length
4. Set `status = generating_content`
5. In parallel:
   - `ArticleContentAiService.generateContent({ title, keyword, outline, depth })` → markdown string
   - `ArticleContentAiService.generateHashtags(title, keyword)` → string[]
6. Log the length against the depth's target, and a warning past its hard maximum
7. Save `draft.content` and `draft.hashtags`, set `status = content_generated`
8. Enqueue `generate-article-thumbnail` job
9. On error: set `status = failed`, save `errorMessage`

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
3. Strip the category tag older drafts carry via `stripTitleCategory(draft.title)`
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
3. Validate `draft.content` exists. If the draft is missing or has no content,
   set record `status = failed` (nothing was posted) and fail the job, leaving
   the draft as it is
4. Set draft `status = publishing`
5. Load `KAKAO_ID` and `KAKAO_PASSWORD` from env via `ConfigService`; take
   `blogName` from the record, falling back to `TISTORY_BLOG_NAME`
6. Call `runTistoryPublish()` via `TistorySessionService` (Playwright automation),
   passing `onBeforePublish` to mark the point past which a post may exist. The
   title goes through `stripTitleCategory` first, so a draft created while titles
   were still tagged is not published with its `[Meaning]`-style tag
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

Registered as a BullMQ job scheduler on every boot, defaulting to `0 21 * * *` in
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
   candidate at or above `PIPELINE_MIN_SCORE` whose verdict is not `drop`, and
   approve it — approval creates the draft and enqueues `article-outline`, so
   the article writes itself from there and the run does not wait for it
3. Count what is left in the pool, by the same test as step 2
4. If the pool is below `POOL_LOW_WATER_MARK`, top it up: enqueue
   `topic-evaluate` for a seed holding unscored candidates, or `topic-generate`
   for the next seed in rotation when no such backlog is left

### Why it draws from the pool

Generation returns ten candidates and a run consumes one, so generating every
run would grow the backlog by nine a day. Drawing from what is already
scored keeps a run cheap — most days it costs nothing but a few queries — and
tops up only when the pool actually thins.

### Which candidate gets picked

In order of precedence:

1. **Seeds with no article go first.** A seed counts as covered once any of its
   candidates has a draft that did not fail — published or still waiting for
   review, the same test `findCoveredTitlesBySeed` uses for scoring. The second
   article on a seed has not found readers: search tends to give a site one page
   per query, and the first article already holds it. Two `rather` articles
   published on the same day drew 125 impressions and none. Approval leaves a
   seed's other candidates `pending`, so without this one generation run books
   the next several articles on the same seed.
2. **Then seeds with no article in the last seven days.** Candidates from one
   seed are scored in the same run and cluster around the same number, so score
   alone would let a single seed supply several days running.
3. **Then highest score**, then the least recently used seed.

Both preferences are orderings, not filters: a pool made entirely of covered or
recent seeds still yields its best candidate. A filter would have stopped the
pipeline the day it shipped, since every candidate then waiting came from a seed
that already had an article.

The evaluator's `drop` verdict is the one filter. The score does not carry it:
uniqueness weighs 0.05 in the overall score, so a model that follows the weights
exactly scores a duplicate of a written article 8.9 and marks it `drop`. Unlike
a seed filter, it cannot stop the pipeline, because the pool count applies the
same test (`whereDrawable` serves both queries): a pool of nothing but dropped
candidates counts as empty and gets topped up.

Fresh seeds reach the pool only by hand for now. The top-up is deliberately left
counting every drawable candidate, covered seeds included: it can only
regenerate from seeds that already exist, so firing it more often would add
candidates to covered seeds rather than bring in new ones.

### Settings

| Variable | Default | Meaning |
|---|---|---|
| `PIPELINE_SCHEDULE_CRON` | `0 21 * * *` | When the run fires |
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

---

## search-console-sync

**Queue**: `search-console-sync`
**Job**: `sync-search-console`

Registered as a BullMQ job scheduler on every boot, defaulting to `0 20 * * *` in
`Asia/Seoul` — an hour ahead of the pipeline run. Jobs are kept for 90 days, for
the same reason as the pipeline scheduler's.

Collection only. Nothing here changes what gets written or in what order; the
data exists so that a later stage can make that decision against something
real.

### Payload
```typescript
{
  manual?: boolean   // set when a person triggered the run
}
```

### Processor Steps
1. Return early if `GSC_SITE_URL` or `GSC_SERVICE_ACCOUNT_JSON` is unset —
   saying so on the job, because a run that does nothing still succeeds
2. Compute the window: `lookbackDays` ending `DATA_LAG_DAYS` ago
3. `POST searchAnalytics.query` with dimensions `query, page`
4. Upsert the rows onto `(normalizedQuery, page, windowEnd)`
5. Link each row to the seed it belongs to
6. Count what landed in striking distance

### Why the window is shifted back

Search Console finalises a day's figures two to three days after the fact. A
window ending today reads near-zero across its last days and drags the average
position down with it, so the whole window is moved back by `DATA_LAG_DAYS`
rather than ending on today.

### Why a rolling window rather than a row per day

Search Console withholds queries whose daily volume is too low to anonymise, and
on a blog this size that is most of them; aggregating over four weeks keeps them.
Consecutive syncs therefore overlap, which is the point — two windows a few weeks
apart are how a position that is climbing tells itself apart from one that is
stuck.

### Seed matching

One `UPDATE` per sync links a row to the **longest** seed whose `normalizedSeed`
appears in the query, so `when it comes to` wins over a shorter seed sitting
inside the same phrase. `position()` rather than `LIKE`, so a seed containing `%`
or `_` is matched literally.

Substring matching is deliberately naive, and misses a whole category: the seed
`adapt vs adopt` does not appear in the query `adapt adopt 차이`. The count of
unmatched rows is written to the job log every run, and that number — not a
guess — is what should decide whether matching needs to get cleverer.

### No paging

The API caps a response at 25,000 rows and this blog returns a few hundred, so
there is no paging: code that never runs is never right when it finally does.
The processor warns on the job when a response comes back at exactly the ceiling,
which is the only way truncation could surface.

### Settings

All optional. Without the first two the app boots normally and the job completes
having done nothing, which is what lets the code deploy before the credentials
exist.

| Variable | Default | Meaning |
|---|---|---|
| `GSC_SITE_URL` | — | Property, exactly as Search Console spells it |
| `GSC_SERVICE_ACCOUNT_JSON` | — | Service account key, raw JSON or base64 |
| `GSC_SYNC_CRON` | `0 20 * * *` | When the sync fires |
| `GSC_SYNC_TZ` | `Asia/Seoul` | Container clocks are UTC, so this matters |
| `GSC_LOOKBACK_DAYS` | `28` | Length of the window asked for |
