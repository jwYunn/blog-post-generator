# Architecture

## Module Overview

The application is organized into 11 NestJS modules. Each module owns its entity, service, controller, and queue processor. There are no cross-module service dependencies — modules communicate only through the queue layer.

```
src/
├── topic-seed/          # User-defined keyword seeds
├── topic-generate/      # AI: Claude generates candidate topics
├── topic-evaluate/      # AI: GPT-4o scores and ranks candidates
├── topic-candidate/     # Candidate storage + approval workflow
├── article-draft/       # Draft lifecycle and status management
├── article-outline/     # AI: GPT-5 generates article outline
├── article-content/     # AI: Claude writes content + hashtags
├── article-thumbnail/   # Sharp image composition + S3 upload
├── article-publish/     # Playwright Tistory automation
├── thumbnail-generator/ # Standalone Flux image generation tool
└── api-source/          # Reference URL tracking
```

## Pipeline Architecture

The content generation pipeline is driven entirely by BullMQ jobs. No stage directly calls the next — each processor enqueues the following job on success, forming an implicit chain:

```
[HTTP POST /topic-seeds/:id/generate]
        │
        ▼
  topic-generate queue
  └── TopicGenerateProcessor
      └── Claude Opus 4.5 → generates 5–10 candidates
      └── Saves TopicCandidateEntity[]

  [Manual: approve candidate via admin UI]
        │
        ▼
  article-draft created (status: queued)
        │
        ▼
  article-outline queue
  └── ArticleOutlineProcessor (concurrency: 3)
      └── GPT-5 → generates outline JSON (title, sections, FAQs)
      └── status → outline_generated
      └── enqueues → article-content
        │
        ▼
  article-content queue
  └── ArticleContentProcessor (concurrency: 3)
      └── Claude Sonnet 4.6 → writes Korean blog post (~2000 chars)
      └── Claude Haiku 4.5 → generates 10 SEO hashtags (parallel)
      └── status → content_generated
      └── enqueues → article-thumbnail
        │
        ▼
  article-thumbnail queue
  └── ArticleThumbnailProcessor (concurrency: 1)
      └── Sharp → composites title text onto image template
      └── AWS S3 → uploads thumbnail
      └── status → review_ready

  [Manual: review and publish via admin UI]
        │
        ▼
  article-publish queue
  └── ArticlePublishProcessor (concurrency: 1)
      └── Playwright → logs into Tistory via Kakao auth
      └── Inserts content into TinyMCE editor
      └── Submits post (now or scheduled)
      └── Captures permalink
      └── Saves ArticlePublishRecordEntity
      └── status → published
```

## Article Draft State Machine

The `article_drafts` table uses an explicit status enum. Status transitions are enforced in service and processor code — no arbitrary updates are permitted.

```
queued
  → generating_outline
    → outline_generated
      → generating_content
        → content_generated
          → generating_thumbnail
            → review_ready
              → publishing
                → published

[any stage] → failed (with errorMessage)
```

Statuses in `IN_PROGRESS_STATUSES` trigger 3-second polling from the frontend admin UI, providing live progress feedback without WebSockets.

## AI Model Selection

Each AI task uses a different model, chosen for the appropriate capability/cost tradeoff:

| Task | Model | Rationale |
|---|---|---|
| Topic generation | Claude Opus 4.5 | Requires creative, high-quality candidate diversity |
| Topic evaluation | GPT-4o | Structured scoring with consistent JSON output |
| Article outline | GPT-5 | Structured reasoning over section planning |
| Article content | Claude Sonnet 4.6 | Long-form Korean prose quality |
| Hashtag generation | Claude Haiku 4.5 | Short, fast, low-cost structured output |
| Thumbnail image | Flux Schnell (Replicate) | Fast image generation with good quality |

Content and hashtag generation for a single article run in parallel, reducing total pipeline latency.

## Database Design

All tables use UUIDs as primary keys. The schema is managed exclusively through TypeORM migrations — `synchronize` is disabled in production.

Key design decisions:

- `topic_candidates.outline_preview` (JSONB) — stores AI-suggested outline at generation time, used as context for the outline stage
- `topic_candidates.evaluation_detail` (JSONB) — flexible schema for per-category scoring breakdown without requiring schema changes
- `article_drafts.outline` / `.hashtags` (JSONB) — structured data stored directly on the draft, avoiding join overhead
- `article_publish_records.schedule` (JSONB) — discriminated union `{mode: 'now'} | {mode: 'schedule', scheduledAt: string}` keeps scheduling flexible
- `topic_seeds.normalizedSeed` — lowercased, unique-indexed to prevent duplicate seeds

## Error Handling

Every queue processor wraps its logic in a try-catch. On failure:

1. `ArticleDraftService.setFailed(id, error.message)` sets status to `failed` and persists the error message (truncated to 500 chars)
2. The exception is re-thrown, which BullMQ records as a failed job in Redis
3. Failed jobs are retained for 7 days and visible in Bull Board at `/queues`

This means every failure is inspectable from two places: the PostgreSQL record (via the admin UI) and the BullMQ dead-letter store (via Bull Board).

## Infrastructure

Local development uses Docker Compose to provide:
- **PostgreSQL 16** — primary datastore
- **Redis 7** — BullMQ job queue + state

Both services are configured via environment variables, with no credentials hardcoded in source.
