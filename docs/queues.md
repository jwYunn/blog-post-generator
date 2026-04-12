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
  userInput: string  // Original seed text (passed to GPT for context)
}
```

### Processor Steps
1. Fetch all `TopicCandidate` rows for `seedId`
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
  mode: 'now' | 'schedule'
  scheduledAt?: string  // ISO 8601 datetime string, required if mode='schedule'
}
```

### Processor Steps
1. Fetch `ArticleDraft` with all relations
2. Validate `draft.content` exists
3. Set `status = publishing`
4. Load `KAKAO_ID` and `KAKAO_PASSWORD` from env via `ConfigService`
5. Call `runTistoryPublish()` via `TistorySessionService` (Playwright automation)
6. Receive `permalink` from Tistory
7. Set `status = published`
8. Create `ArticlePublishRecord` with `draftId`, `permalink`, `schedule`
9. On error: set `status = failed`, save `errorMessage`

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

**Note**: `topic-generate` does NOT auto-chain to `topic-evaluate`. They are manually triggered independently.
