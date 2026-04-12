# API Endpoints

Base URL: `http://localhost:3000` (configurable)
All endpoints accept and return `application/json`.

---

## Topic Seeds

### POST /topic-seeds
Create a new seed keyword.

**Request body**
```typescript
{
  seed: string          // required; raw seed text
  category: TopicSeedCategory  // required
  priority?: number     // optional; default 5
  memo?: string         // optional
}
```

**Response** `201` — created `TopicSeed` object

---

### GET /topic-seeds
List seeds with pagination and filtering.

**Query params**
```
page?        number   default 1
limit?       number   default 20
category?    TopicSeedCategory
isActive?    boolean
search?      string   matches seed text
sortBy?      'createdAt' | 'priority' | 'usedCount'
sortOrder?   'ASC' | 'DESC'
```

**Response** `200`
```typescript
{
  data: TopicSeed[]
  total: number
  page: number
  limit: number
}
```

---

### GET /topic-seeds/:id
Get a single seed by ID.

**Response** `200` — `TopicSeed` object, or `404`

---

### GET /topic-seeds/:id/candidates
List all topic candidates for a seed.

**Query params** — same pagination/filter params as `GET /topic-candidates`

**Response** `200` — paginated candidate list

---

### PATCH /topic-seeds/:id
Update a seed.

**Request body** — partial; any fields from create

**Response** `200` — updated `TopicSeed`

---

### DELETE /topic-seeds/:id
Soft-delete a seed. Sets `deletedAt`; does not remove the row.

**Response** `200`

---

### POST /topic-seeds/:id/generate
Enqueue a topic candidate generation job for this seed.

**Response** `201`
```typescript
{
  message: string
  seedId: string
}
```

---

### POST /topic-seeds/:id/evaluate
Enqueue a topic candidate evaluation job for this seed.

**Response** `201`
```typescript
{
  message: string
  seedId: string
}
```

---

## Topic Candidates

### GET /topic-candidates
List candidates with pagination, filtering, and sorting.

**Query params**
```
page?          number
limit?         number
seedId?        string UUID — filter by parent seed
status?        'pending' | 'approved' | 'rejected'
keyword?       string — partial match on keyword
minScore?      number
maxScore?      number
sortBy?        'createdAt' | 'score' | 'overallScore' | 'rank'
sortOrder?     'ASC' | 'DESC'
```

**Response** `200`
```typescript
{
  data: TopicCandidate[]
  total: number
  page: number
  limit: number
}
```

---

### PATCH /topic-candidates/:id/status
Approve or reject a candidate.

**Request body**
```typescript
{
  status: 'approved' | 'rejected'
}
```

**Approve side-effects** (transactional):
1. Sets candidate `status = approved`
2. Rejects all sibling candidates with `status = pending` for the same seed
3. Creates `ArticleDraft` (if not already exists) with `status = queued`
4. Enqueues `generate-article-outline` job

**Response** `200` — updated `TopicCandidate`

---

## Article Drafts

### GET /article-drafts
List drafts with pagination and status filter.

**Query params**
```
page?     number
limit?    number
status?   ArticleDraftStatus
```

**Response** `200`
```typescript
{
  data: ArticleDraft[]
  total: number
  page: number
  limit: number
}
```

---

### GET /article-drafts/:id
Get a single draft (includes outline, content, hashtags).

**Response** `200` — `ArticleDraft` object, or `404`

---

### POST /article-drafts/:id/publish
Trigger publishing to Tistory.

**Request body**
```typescript
{
  mode: 'now' | 'schedule'
  scheduledAt?: string  // ISO 8601; required if mode='schedule'
}
```

**Precondition**: Draft must be in `review_ready` status.

**Response** `201`
```typescript
{
  message: string
  jobId: string
}
```

---

## API Sources

### POST /api-sources
Create a new API source entry.

**Request body**
```typescript
{
  name: string   // e.g. "OpenAI"
  url: string    // e.g. "https://platform.openai.com/settings/organization/billing/overview"
  meta?: object  // optional JSONB
}
```

**Response** `201` — created `ApiSource`

---

### GET /api-sources
List all API sources.

**Response** `200` — `ApiSource[]`

---

### GET /api-sources/:id
Get a single source.

**Response** `200` — `ApiSource`, or `404`

---

### PATCH /api-sources/:id
Update a source.

**Request body** — partial

**Response** `200` — updated `ApiSource`

---

### DELETE /api-sources/:id
Delete a source (hard delete).

**Response** `200`

---

## Thumbnail Generator

### POST /thumbnail-generator/generate
Create a prompt and enqueue image generation.

**Request body**
```typescript
{
  prompt: string         // required; image generation text
  name?: string          // optional label
  model?: string         // default: "black-forest-labs/flux-schnell"
  aspect_ratio?: string  // default: "16:9"
  output_format?: string // default: "webp"
  num_outputs?: number   // 1–4; default: 1
  output_quality?: number // 0–100; default: 80
}
```

**Response** `201` — created `ThumbnailPrompt` (status=`generating`)

---

### GET /thumbnail-generator/prompts
List all prompts with pagination.

**Query params**
```
page?   number  default 1
limit?  number  default 30
```

**Response** `200`
```typescript
{
  data: ThumbnailPrompt[]
  total: number
  page: number
  limit: number
}
```

---

### GET /thumbnail-generator/prompts/:id
Get a single prompt (use for polling generation status).

**Response** `200` — `ThumbnailPrompt` with `status` field, or `404`

**Polling**: Poll every 3 seconds until `status === 'done'` or `'failed'`.

---

### GET /thumbnail-generator/prompts/:id/images
Get all generated images for a prompt.

**Response** `200` — `ThumbnailPromptMapping[]` each including nested `thumbnail` object:
```typescript
Array<{
  id: string
  promptId: string
  thumbnailId: string
  rank: number | null
  active: boolean
  createdAt: string
  thumbnail: {
    id: string
    url: string       // S3 public URL
    mimeType: string
    width: number | null
    height: number | null
  }
}>
```

---

### PATCH /thumbnail-generator/mappings/:mappingId/active
Toggle the active flag for a generated image.

**Request body**
```typescript
{
  active: boolean
}
```

**Response** `200` — updated `ThumbnailPromptMapping`

---

### DELETE /thumbnail-generator/prompts/:id
Delete a prompt and all its mappings (CASCADE).

**Response** `200`

---

## Bull Board

### GET /queues
Bull Board dashboard — monitor all BullMQ queues, view job status, retry failed jobs.

Available in development. Not a REST API endpoint.
