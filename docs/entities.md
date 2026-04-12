# Database Schema

PostgreSQL database managed by TypeORM. Migrations are in `src/database/migrations/`.

---

## topic_seeds

Seed keywords that drive the generation pipeline. Supports soft delete.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | Auto-generated |
| `seed` | VARCHAR(100) | NOT NULL | Original input text |
| `normalizedSeed` | VARCHAR(100) | UNIQUE, NOT NULL | Lowercase + trimmed; used for dedup |
| `category` | ENUM | NOT NULL | `TopicSeedCategory` |
| `priority` | INT | DEFAULT 5 | Higher = more important |
| `isActive` | BOOLEAN | DEFAULT true | Inactive seeds are skipped |
| `memo` | TEXT | NULLABLE | Free-form notes |
| `usedCount` | INT | DEFAULT 0 | Incremented each time generation runs |
| `lastUsedAt` | TIMESTAMP | NULLABLE | Updated on each generation |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |
| `updatedAt` | TIMESTAMP | NOT NULL | Auto |
| `deletedAt` | TIMESTAMP | NULLABLE | Soft delete |

### Enum: TopicSeedCategory
```
meaning     — word/phrase meaning explanation
difference  — comparison between similar terms
example     — usage examples
phrases     — phrasal verbs / idioms
grammar     — grammar rules
```

---

## topic_candidates

AI-generated topic ideas derived from a seed. Includes evaluation results after scoring.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `topicSeedId` | UUID | FK→topic_seeds, CASCADE | |
| `keyword` | VARCHAR(200) | NOT NULL | Primary SEO keyword |
| `title` | VARCHAR(300) | NOT NULL | Korean SEO title |
| `score` | INT | DEFAULT 0 | Manual score (legacy) |
| `searchIntent` | VARCHAR(50) | NULLABLE | e.g. "informational", "navigational" |
| `targetReader` | VARCHAR(20) | NULLABLE | e.g. "beginner", "intermediate" |
| `whyThisTopic` | TEXT | NULLABLE | Rationale from generation prompt |
| `outlinePreview` | JSONB | NULLABLE | `string[]` — preview section titles |
| `overallScore` | DECIMAL(5,2) | NULLABLE | GPT evaluation score (0–100) |
| `rank` | INT | NULLABLE | Rank among siblings (1 = best) |
| `strengths` | JSONB | NULLABLE | `string[]` |
| `weaknesses` | JSONB | NULLABLE | `string[]` |
| `verdict` | VARCHAR | NULLABLE | `'keep' \| 'consider' \| 'drop'` |
| `evaluationDetail` | JSONB | NULLABLE | Per-criterion scores object |
| `status` | ENUM | DEFAULT `pending` | `TopicCandidateStatus` |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |
| `updatedAt` | TIMESTAMP | NOT NULL | Auto |

### Enum: TopicCandidateStatus
```
pending   — awaiting review
approved  — selected for article generation
rejected  — discarded
```

### evaluationDetail shape (JSONB)
```typescript
{
  search_intent_clarity: number   // 0–10
  topic_specificity: number       // 0–10
  seo_title_quality: number       // 0–10
  practical_value: number         // 0–10
  outline_feasibility: number     // 0–10
  uniqueness: number              // 0–10
}
```

---

## article_drafts

One-to-one with an approved `TopicCandidate`. Tracks the full lifecycle from outline to publishing.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `topicCandidateId` | UUID | FK→topic_candidates, UNIQUE, CASCADE | One draft per candidate |
| `title` | VARCHAR(300) | NOT NULL | Includes category prefix |
| `keyword` | VARCHAR(200) | NOT NULL | SEO keyword |
| `outline` | JSONB | NULLABLE | `ArticleOutline` object |
| `content` | TEXT | NULLABLE | Full markdown article |
| `thumbnailImageUrl` | TEXT | NULLABLE | S3 URL |
| `hashtags` | JSONB | NULLABLE | `string[]` — 10 hashtags |
| `status` | ENUM | DEFAULT `queued` | `ArticleDraftStatus` |
| `errorMessage` | TEXT | NULLABLE | Set on `failed` status |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |
| `updatedAt` | TIMESTAMP | NOT NULL | Auto |

### Enum: ArticleDraftStatus
```
queued                — created, waiting for outline queue
generating_outline    — ArticleOutlineProcessor running
outline_generated     — outline saved, waiting for content queue
generating_content    — ArticleContentProcessor running
content_generated     — content + hashtags saved, waiting for thumbnail queue
generating_thumbnail  — ArticleThumbnailProcessor running
review_ready          — thumbnail uploaded; ready for manual review
publishing            — ArticlePublishProcessor running
published             — live on Tistory
failed                — error at any stage (see errorMessage)
```

### outline shape (JSONB)
```typescript
{
  title: string
  keyword: string
  searchIntent: string
  sections: string[]   // exactly 3, in Korean
  faqs: string[]       // 1–2, in Korean
}
```

---

## article_publish_records

Audit log of publishing events for each draft.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `draftId` | UUID | FK→article_drafts, CASCADE | |
| `permalink` | VARCHAR(500) | NULLABLE | Published Tistory URL |
| `schedule` | JSONB | NULLABLE | `PublishSchedule` union |
| `meta` | JSONB | NULLABLE | Extensible metadata |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |

### PublishSchedule shape (JSONB)
```typescript
{ mode: 'now' }
| { mode: 'schedule'; scheduledAt: string }  // ISO 8601
```

---

## api_sources

Reference table for tracking external API endpoints used in the project.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `name` | VARCHAR(100) | NOT NULL | e.g. "OpenAI" |
| `url` | VARCHAR(500) | NOT NULL | Dashboard / billing URL |
| `meta` | JSONB | NULLABLE | Flexible metadata |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |
| `updatedAt` | TIMESTAMP | NOT NULL | Auto |

---

## thumbnail_prompts

Stores AI image generation requests and their status.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `name` | VARCHAR(100) | NULLABLE | Human-readable label |
| `prompt` | TEXT | NOT NULL | Image generation prompt |
| `model` | VARCHAR(100) | DEFAULT `black-forest-labs/flux-schnell` | Replicate model ID |
| `meta` | JSONB | NULLABLE | `ThumbnailPromptMeta` |
| `status` | ENUM | DEFAULT `generating` | `ThumbnailPromptStatus` |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |
| `updatedAt` | TIMESTAMP | NOT NULL | Auto |

### Enum: ThumbnailPromptStatus
```
generating  — job in queue or running
done        — all images generated and saved
failed      — Replicate API or upload error
```

### meta shape (JSONB) — ThumbnailPromptMeta
```typescript
{
  aspect_ratio?: string     // e.g. "16:9", "1:1"
  output_format?: string    // "webp" | "jpg" | "png"
  output_quality?: number   // 0–100
  num_outputs?: number      // 1–4
  megapixels?: string       // e.g. "1"
}
```

---

## thumbnails

Individual generated images stored on S3.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `url` | TEXT | NOT NULL | S3 public URL |
| `mimeType` | VARCHAR(50) | NULLABLE | e.g. "image/webp" |
| `width` | INT | NULLABLE | Pixels |
| `height` | INT | NULLABLE | Pixels |
| `meta` | JSONB | NULLABLE | Extensible image metadata |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |
| `updatedAt` | TIMESTAMP | NOT NULL | Auto |

---

## thumbnail_prompt_mappings

Join table linking prompts to their generated images. Tracks which image is selected as active.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK | |
| `promptId` | UUID | FK→thumbnail_prompts, CASCADE | |
| `thumbnailId` | UUID | FK→thumbnails, CASCADE | |
| `rank` | INT | NULLABLE | Order of results (1 = first) |
| `active` | BOOLEAN | DEFAULT false | User-selected image |
| `createdAt` | TIMESTAMP | NOT NULL | Auto |

---

## Migration History

| Timestamp | Migration | Change |
|-----------|-----------|--------|
| 1773446400000 | CreateTopicSeedsTable | Create `topic_seeds` with enum, soft delete |
| 1773532800000 | CreateTopicCandidatesTable | Create `topic_candidates` with FK, status enum |
| 1773619200000 | CreateArticleDraftsTable | Create `article_drafts` with unique FK, status enum |
| 1773705600000 | AddHashtagsToArticleDrafts | Add `hashtags` JSONB column |
| 1773792000000 | AddPublishingStatusToArticleDrafts | Extend status enum with publishing states |
| 1773878400000 | CreateArticlePublishRecordsTable | Create `article_publish_records` |
| 1774051200000 | AddAiFieldsToTopicCandidates | Add `overallScore`, `rank`, `strengths`, `weaknesses`, `verdict` |
| 1774137600000 | AddEvaluationFieldsToTopicCandidates | Add evaluation-specific fields |
| 1774224000000 | AddEvaluationDetailToTopicCandidates | Add `evaluationDetail` JSONB |
| 1774310400000 | AlterOverallScoreToDecimal | Change `overallScore` INT → DECIMAL(5,2) |
| 1774396800000 | CreateApiSourcesTable | Create `api_sources` |
| 1774483200000 | CreateThumbnailGeneratorTables | Create `thumbnail_prompts`, `thumbnails`, `thumbnail_prompt_mappings` |
