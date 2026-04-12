# Overview & Architecture

## Purpose

Automated pipeline that turns English vocabulary/grammar seed keywords into published Korean blog articles on Tistory. Each stage is decoupled via BullMQ queues so failures are isolated and retryable.

## Full Pipeline

```
[User] POST /topic-seeds/:id/generate
         │
         ▼
  [Queue] topic-generate
  TopicGenerateProcessor
  → Claude opus-4-5 generates 10 topic candidates
  → Save TopicCandidates (status=pending)
         │
         ▼ (manual trigger)
[User] POST /topic-seeds/:id/evaluate
         │
         ▼
  [Queue] topic-evaluate
  TopicEvaluateProcessor
  → GPT-4o scores each candidate (0–100)
  → Updates: overallScore, rank, verdict, strengths, weaknesses
         │
         ▼ (manual: pick the best candidate)
[User] PATCH /topic-candidates/:id/status  { status: "approved" }
         │
         ├── Approve target candidate
         ├── Reject all sibling PENDING candidates (transactional)
         └── Create ArticleDraft (status=queued)
         │
         ▼
  [Queue] article-outline
  ArticleOutlineProcessor
  → GPT-5 generates SEO outline (3 sections + 1–2 FAQs in Korean)
  → Draft status: queued → generating_outline → outline_generated
         │
         ▼
  [Queue] article-content
  ArticleContentProcessor
  → Claude sonnet-4-6 writes full markdown article (~2000 Korean chars)
  → Claude haiku-4-5 generates 10 hashtags (parallel)
  → Draft status: outline_generated → generating_content → content_generated
         │
         ▼
  [Queue] article-thumbnail
  ArticleThumbnailProcessor
  → Sharp composites title text onto template image
  → Upload to S3
  → Draft status: content_generated → generating_thumbnail → review_ready
         │
         ▼ (manual review)
[User] POST /article-drafts/:id/publish
         │
         ▼
  [Queue] article-publish
  ArticlePublishProcessor
  → Playwright automates Tistory login + post creation
  → Draft status: review_ready → publishing → published
  → Creates ArticlePublishRecord with permalink
```

## Optional: Thumbnail Generator Pipeline

Independent pipeline for generating custom thumbnails via Replicate (not tied to article drafts).

```
[User] POST /thumbnail-generator/generate  { prompt, model, ...options }
         │
         ▼
  Create ThumbnailPrompt (status=generating)
  [Queue] thumbnail-generator
  ThumbnailGeneratorProcessor
  → Calls Replicate API (default: flux-schnell)
  → Downloads generated images
  → Uploads each to S3
  → Creates Thumbnail + ThumbnailPromptMapping records
  → Prompt status: generating → done (or failed)
         │
         ▼ (manual)
[User] PATCH /thumbnail-generator/mappings/:id/active  { active: true }
```

## Module Map

| Module | Responsibility |
|--------|---------------|
| `topic-seed` | CRUD for seed keywords; triggers generate/evaluate jobs |
| `topic-generate` | Queue processor + Claude AI service for candidate generation |
| `topic-candidate` | CRUD for candidates; approval workflow; evaluation save |
| `topic-evaluate` | Queue processor + GPT AI service for candidate scoring |
| `article-draft` | CRUD for drafts; status tracking; publish trigger |
| `article-outline` | Queue processor + GPT AI service for outline generation |
| `article-content` | Queue processor + Claude AI service for content + hashtags |
| `article-thumbnail` | Queue processor; Sharp image composition; S3 upload |
| `article-publish` | Queue processor; Playwright Tistory automation |
| `thumbnail-generator` | Independent prompt-based image generation via Replicate |
| `api-source` | Simple CRUD for tracking external API usage sources |

## Entity Relationship Summary

```
topic_seeds ──(1:N)──► topic_candidates ──(1:1)──► article_drafts ──(1:N)──► article_publish_records

thumbnail_prompts ──(1:N)──► thumbnail_prompt_mappings ──(N:1)──► thumbnails

api_sources  (standalone)
```

## Status Progressions

### ArticleDraft
```
queued
  → generating_outline → outline_generated
  → generating_content → content_generated
  → generating_thumbnail → review_ready
  → publishing → published
  (any stage can → failed)
```

### TopicCandidate
```
pending → approved | rejected
```

### ThumbnailPrompt
```
generating → done | failed
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `POSTGRES_HOST/PORT/USER/PASSWORD/DB` | PostgreSQL connection |
| `REDIS_HOST/PORT` | Redis / BullMQ connection |
| `ANTHROPIC_API_KEY` | Claude models |
| `OPENAI_API_KEY` | GPT models |
| `REPLICATE_API_TOKEN` | Replicate image generation |
| `AWS_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_S3_PUBLIC_BASE_URL` | Public base URL for S3 assets |
| `KAKAO_ID` | Tistory/Kakao login |
| `KAKAO_PASSWORD` | Tistory/Kakao login |
| `CORS_ORIGIN` | Frontend origin (default: http://localhost:5173) |

## Key Conventions

- Queue and job name constants are co-located with each module (not in a central file)
- Processors set `status=failed` + save `errorMessage` on any uncaught error
- `ConfigService` is used everywhere instead of `process.env` directly
- All list endpoints support pagination (`page`, `limit`) defaulting to page=1, limit=20
- Soft delete is used only for `topic_seeds`; all other entities use hard delete
