# AI Services

## Service Matrix

| Module | Service | Provider | Model | Max Tokens | Task |
|--------|---------|----------|-------|------------|------|
| topic-generate | `TopicGenerateAiService` | Anthropic | `claude-opus-4-5` | 4096 | Generate 10 topic candidates |
| topic-evaluate | `TopicEvaluateAiService` | OpenAI | `gpt-4o` | 8192 | Score & rank candidates |
| article-outline | `ArticleOutlineAiService` | OpenAI | `gpt-5` | — | Generate SEO article outline |
| article-content | `ArticleContentAiService` | Anthropic | `claude-sonnet-4-6` | 10000 | Write full markdown article |
| article-content | `ArticleContentAiService` | Anthropic | `claude-haiku-4-5` | 300 | Generate 10 hashtags |
| thumbnail-generator | `ThumbnailGeneratorAiService` | Replicate | `black-forest-labs/flux-schnell` (default) | — | Generate thumbnail images |

---

## TopicGenerateAiService

**File**: `src/topic-generate/topic-generate-ai.service.ts`
**Model**: `claude-opus-4-5` (Anthropic)

### Method: `generateCandidates(seedText: string)`

**Input**
```
seedText: string  // e.g. "custom vs customs"
```

**Prompt template** (`TOPIC_GENERATE_PROMPT`): Substitutes `{{USER_INPUT}}` with seedText.

**Prompt instructions**:
- Generate exactly 10 distinct topic candidates
- Each candidate targets Korean English learners searching on Google
- Title must be in Korean (SEO-friendly)
- Output strict JSON array (no markdown fences)

**Output** — parsed JSON array:
```typescript
Array<{
  title: string           // Korean SEO title
  primary_keyword: string // Main SEO keyword
  search_intent: string   // e.g. "informational"
  target_reader: string   // e.g. "beginner", "intermediate"
  why_this_topic: string  // Rationale
  outline_preview: string[] // 3–5 section title hints
}>
```

**Error handling**: On JSON parse failure, logs raw Claude response to stderr.

---

## TopicEvaluateAiService

**File**: `src/topic-evaluate/topic-evaluate-ai.service.ts`
**Model**: `gpt-4o` (OpenAI)

### Method: `evaluateCandidates(candidates: CandidateInput[])`

**Input**
```typescript
Array<{
  id: string
  title: string
  keyword: string
  searchIntent: string
  targetReader: string
  whyThisTopic: string
  outlinePreview: string[]
}>
```

**Prompt template** (`TOPIC_EVALUATE_PROMPT`): Substitutes `{{CANDIDATES}}` with JSON-serialized candidates.

**Evaluation criteria** (each scored 0–10):
- `search_intent_clarity` — how well the topic matches a specific search query
- `topic_specificity` — narrow enough to rank; avoids vague broad terms
- `seo_title_quality` — title click-worthiness and keyword placement
- `practical_value` — useful / actionable content for learners
- `outline_feasibility` — can be written as a complete 2000-char article
- `uniqueness` — differentiated from generic content

**Output** — parsed JSON array:
```typescript
Array<{
  id: string
  overall_score: number       // weighted average, e.g. 8.9
  rank: number                // 1 = best
  evaluation: {
    search_intent_clarity: number
    topic_specificity: number
    seo_title_quality: number
    practical_value: number
    outline_feasibility: number
    uniqueness: number
  }
  strengths: string[]
  weaknesses: string[]
  verdict: 'keep' | 'consider' | 'drop'
}>
```

**Note**: `overall_score` is stored as `DECIMAL(5,2)` because GPT returns decimal values like `8.9`.

---

## ArticleOutlineAiService

**File**: `src/article-outline/article-outline-ai.service.ts`
**Model**: `gpt-5` (OpenAI)
**System role**: `"You generate structured SEO blog outlines."`

### Method: `generateOutline(title, keyword, searchIntent, targetReader, outlinePreview)`

**Input**
```typescript
title: string
keyword: string
searchIntent: string | null
targetReader: string | null
outlinePreview: string[] | null  // hints from candidate generation
```

**Prompt requirements**:
- Exactly 3 main sections (no more, no less)
- All section titles and FAQ items in Korean
- Keep English vocabulary and SEO terms in English within Korean sentences
- Sections must not overlap in content
- 1–2 FAQ items; FAQ must not repeat section topics

**Output** — parsed JSON:
```typescript
{
  title: string
  keyword: string
  searchIntent: string
  sections: string[]  // exactly 3 Korean section titles
  faqs: string[]      // 1–2 Korean FAQ questions
}
```

---

## ArticleContentAiService

**File**: `src/article-content/article-content-ai.service.ts`

### Method 1: `generateContent(input)`

**Model**: `claude-sonnet-4-6` (Anthropic), max tokens: 10000

**Input**
```typescript
{
  title: string
  keyword: string
  outline: ArticleOutline  // { sections, faqs, ... }
}
```

**Content requirements**:
- Audience: Korean English learners
- Tone: friendly, practical, educational (not academic)
- Length: 1800–2500 Korean characters (hard max: 3000)
- Language: Korean explanations + English vocabulary/examples
- Format: Markdown
  - NO blockquotes (`>`)
  - Do NOT repeat the title at the top
  - Start directly with introduction
  - Max 2–3 example sentences per section
- Do NOT include a "관련 글 추천" (related posts) section at the end

**Output**: Raw markdown string

### Method 2: `generateHashtags(input)`

**Model**: `claude-haiku-4-5` (Anthropic), max tokens: 300

**Input**
```typescript
{
  title: string
  keyword: string
}
```

**Hashtag requirements**:
- Exactly 10 hashtags
- Mix: roughly half Korean, half English
- Format: `#keyword` (with `#` prefix)
- Focus on SEO value: main keyword, related topics, learner-level terms

**Output**: Parsed JSON array of 10 strings

---

## ThumbnailGeneratorAiService

**File**: `src/thumbnail-generator/thumbnail-generator-ai.service.ts`
**Provider**: Replicate
**Default model**: `black-forest-labs/flux-schnell`

### CommonJS Interop Note
The `replicate` npm package uses `module.exports = Replicate` (not ES module default export). The service uses `require()` instead of ES import to avoid the `replicate_1.default is not a constructor` error:
```typescript
import type ReplicateType from 'replicate';
const ReplicateSDK = require('replicate') as typeof ReplicateType;
// new ReplicateSDK({ auth: ... })
```

### Method: `generate(prompt, model, meta)`

**Input**
```typescript
prompt: string               // image generation prompt
model: string                // Replicate model ID (owner/model)
meta: ThumbnailPromptMeta    // { aspect_ratio, output_format, output_quality, num_outputs }
```

**Replicate API call parameters**:
```typescript
{
  prompt,
  aspect_ratio: meta.aspect_ratio ?? '16:9',
  output_format: meta.output_format ?? 'webp',
  output_quality: meta.output_quality ?? 80,
  num_outputs: meta.num_outputs ?? 1,
}
```

**Process**:
1. Submit prediction to Replicate (blocking until done)
2. Download each output image URL to Buffer
3. Return array of `{ buffer: Buffer, mimeType: string }`

**Output**
```typescript
Array<{
  buffer: Buffer
  mimeType: string  // e.g. "image/webp"
}>
```

**Supported models** (tested):
- `black-forest-labs/flux-schnell` — fast, lower cost ($0.003/image)
- `black-forest-labs/flux-dev` — higher quality, higher cost ($0.025/image)

---

## Cost & Model Selection Rationale

| Task | Model | Why |
|------|-------|-----|
| Topic generation | Claude Opus | Needs creativity and topic diversity |
| Topic evaluation | GPT-4o | Strong analytical/scoring reasoning |
| Outline | GPT-5 | Structured JSON output with strict constraints |
| Article content | Claude Sonnet | Best balance of quality/cost for long-form Korean |
| Hashtags | Claude Haiku | Simple extraction task; minimize cost |
| Thumbnails | Replicate Flux Schnell | Fast iteration; swap model in request payload |
