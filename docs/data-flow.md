# Data Flow

This document traces the complete lifecycle of a blog post from seed input to published URL.

---

## Stage 1 — Topic Seed

The user creates a `TopicSeed` via the admin UI. A seed is a short keyword or phrase (e.g., `"run vs jog"`) with a category (`meaning`, `difference`, `example`, `phrases`, `grammar`), a priority (1–10), and an active flag.

Seeds are deduplicated by `normalizedSeed` (lowercased). A `usedCount` field tracks how many times candidates have been generated from this seed.

```
POST /topic-seeds
→ TopicSeedEntity saved (status: active)
```

---

## Stage 2 — Topic Candidate Generation

```
POST /topic-seeds/:id/generate
→ Enqueues job on topic-generate queue
```

**Processor: `TopicGenerateProcessor`**

1. Fetches `TopicSeedEntity` with category and existing candidates (for deduplication)
2. Calls `TopicGenerateAiService` → **Claude Opus 4.5**
   - Prompt includes seed, category, and previously generated titles to avoid repetition
   - Returns structured JSON: array of `{ title, keyword, score, searchIntent, targetReader, whyThisTopic, outlinePreview }`
3. Saves each item as a `TopicCandidateEntity` (status: `pending`)
4. Increments `usedCount` and updates `lastUsedAt` on the seed

At this point, the admin reviews generated candidates in the UI.

---

## Stage 3 — Topic Evaluation (Optional)

```
POST /topic-seeds/:id/evaluate
→ Enqueues job on topic-evaluate queue
```

**Processor: `TopicEvaluateProcessor`**

1. Fetches all `pending` candidates for the seed
2. Calls `TopicEvaluateAiService` → **GPT-4o**
   - Receives all candidates at once for comparative scoring
   - Returns per-candidate: `overallScore` (0–100), `rank`, `strengths[]`, `weaknesses[]`, `verdict` (keep/consider/drop), `evaluationDetail` (per-dimension breakdown)
3. Saves evaluation fields on each `TopicCandidateEntity`

The admin can then sort by score and approve candidates to proceed.

---

## Stage 4 — Candidate Approval

```
PATCH /topic-candidates/:id/status  { "status": "approved" }
→ ArticleDraftService.createFromCandidate()
→ ArticleDraftEntity saved (status: queued)
→ Enqueues job on article-outline queue
```

A `TopicCandidateEntity` has a 1:1 unique constraint with `ArticleDraftEntity`, so each candidate can only produce one draft.

---

## Stage 5 — Article Outline

**Processor: `ArticleOutlineProcessor`** (concurrency: 3)

1. Fetches draft + associated candidate (for `searchIntent`, `targetReader`, `outlinePreview`)
2. Sets draft status → `generating_outline`
3. Calls `ArticleOutlineAiService` → **GPT-5**
   - Input: title, keyword, search intent, target reader, AI-suggested outline preview
   - Output: `{ title, keyword, searchIntent, sections: string[], faqs: string[] }`
4. Saves outline as JSONB on `article_drafts.outline`
5. Sets status → `outline_generated`
6. Enqueues job on `article-content` queue

---

## Stage 6 — Article Content + Hashtags

**Processor: `ArticleContentProcessor`** (concurrency: 3)

Two AI calls run in parallel:

**Content** — `ArticleContentAiService` → **Claude Sonnet 4.6**
- Input: full outline (title, sections, FAQs), keyword, search intent, target reader
- Output: complete Korean blog post in Markdown (~1800–2500 characters)
- Structured to match the outline sections

**Hashtags** — same service → **Claude Haiku 4.5**
- Input: title, keyword
- Output: 10 SEO-relevant hashtags as `string[]`

Both results are saved on the draft entity. Status → `content_generated`. Next job enqueued on `article-thumbnail`.

---

## Stage 7 — Thumbnail Generation

**Processor: `ArticleThumbnailProcessor`** (concurrency: 1)

1. Sets status → `generating_thumbnail`
2. Calls `ThumbnailImageProcessingService` (Sharp)
   - `stripTitleCategory()` cleans the title (removes category prefix if present)
   - Composites cleaned title text onto a base image template
   - Outputs a JPEG/WebP buffer
3. Calls `ThumbnailS3UploadService` → **AWS S3**
   - Uploads buffer with generated filename
   - Returns a public S3 URL
4. Saves URL to `article_drafts.thumbnailImageUrl`
5. Sets status → `review_ready`

The draft is now fully generated and awaiting human review.

---

## Stage 8 — Human Review

The admin views the draft in the admin UI:
- Reads the full article in Markdown, HTML, or Preview mode
- Reviews the thumbnail
- Copies content or HTML for inspection
- Clicks **Publish** when satisfied

---

## Stage 9 — Publishing

```
POST /article-drafts/:id/publish  { "mode": "now" | "schedule", "scheduledAt"?: "ISO string" }
→ ArticlePublishService creates PublishRecordEntity (pending)
→ Enqueues job on article-publish queue
→ Returns { jobId }
```

**Processor: `ArticlePublishProcessor`** (concurrency: 1 — serialized)

1. Sets draft status → `publishing`
2. Calls `runTistoryPublish()` with Playwright:
   - Launches Chromium (headless)
   - Navigates to Kakao login page
   - Enters credentials; waits for mobile auth approval (up to 5 minutes)
   - Navigates to Tistory blog editor
   - Selects category matching the topic seed's category via `aria-label`
   - Inserts thumbnail as `<img>` HTML at the top of the editor
   - Converts Markdown content → HTML via `marked`
   - Types content into the TinyMCE iframe editor using `humanType()` (simulates natural keystrokes: 40–120ms delay per character with random pauses)
   - Sets publish mode: immediate or scheduled datetime
   - Submits the post
   - Captures the resulting Tistory permalink
3. Saves permalink and schedule metadata to `ArticlePublishRecordEntity`
4. Sets draft status → `published`

---

## Data Shape at Each Stage

| Stage | Key Fields Set |
|---|---|
| Seed created | `seed`, `category`, `priority`, `isActive` |
| Candidates generated | `title`, `keyword`, `score`, `searchIntent`, `targetReader`, `outlinePreview` |
| Candidates evaluated | `overallScore`, `rank`, `strengths`, `weaknesses`, `verdict`, `evaluationDetail` |
| Draft created | `topicCandidateId`, `title`, `keyword`, status=`queued` |
| Outline generated | `outline` (JSONB) |
| Content generated | `content` (Markdown), `hashtags` (string[]) |
| Thumbnail generated | `thumbnailImageUrl` (S3 URL) |
| Published | `PublishRecord.permalink`, `PublishRecord.schedule` |
