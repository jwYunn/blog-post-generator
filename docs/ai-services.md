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

## Where prompts live

Every model prompt is in its module's `<module>-prompt.ts`; the service only
makes the call and parses the answer. A prompt change is then a diff to that
file alone, and the prompt can be tested without loading a model SDK.

The form follows the prompt. `topic-generate` and `topic-evaluate` have no
conditions, so they are constant templates whose `{{PLACEHOLDERS}}` the service
fills. `article-outline` and `article-content` change whole lines by depth and
drop a block when an outline has no FAQs, which placeholders cannot express
without moving that logic back into the service - so they export builder
functions instead. What a prompt asks for sits beside it: `OUTLINE_SHAPES` and
`CONTENT_LENGTHS` are in the prompt files, and the processors read them from
there to check a result against what was asked.

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
- Generate **up to** 10 distinct topic candidates, and fewer when the seed does
  not support more. Asking for ten from a seed carrying one real question is
  what produced angles like "<expression> for your English diary" — specific,
  well written, and searched by nobody
- Each candidate targets Korean English learners searching on Google
- Title must be in Korean (SEO-friendly)
- Each candidate gets a **depth** — see [Article depth](#article-depth)
- Output strict JSON array (no markdown fences)

Titles with no Korean in them are dropped in `TopicGenerateAiService` rather than
left for the evaluation to mark down: a title this blog's readers cannot search
is unusable, not merely weaker. The processor records how many were dropped,
since a non-zero count means the prompt is being ignored.

**Output** — parsed JSON array:
```typescript
Array<{
  title: string           // Korean SEO title
  primary_keyword: string // Main SEO keyword
  search_intent: string   // e.g. "informational"
  target_reader: string   // e.g. "beginner", "intermediate"
  depth: string           // "brief" | "standard"; stored as null if unusable
  why_this_topic: string  // Rationale
  outline_preview: string[] // 1–2 hints for brief, 3 for standard
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
  depth: string | null    // null is treated as standard
  whyThisTopic: string
  outlinePreview: string[]
}>
```

**Prompt template** (`TOPIC_EVALUATE_PROMPT`): Substitutes `{{CANDIDATES}}` with
JSON-serialized candidates and `{{COVERED}}` with the titles this seed has
already been turned into articles under.

**Evaluation criteria** (each scored 1–10, weights in brackets):
- `search_demand` **[0.30]** — would a learner actually type this into a search
  box? Judged separately from whether the topic is useful
- `search_intent_clarity` [0.15] — how well the topic matches a specific search query
- `topic_specificity` [0.15] — narrow enough to rank; avoids vague broad terms
- `seo_title_quality` [0.15] — title click-worthiness and keyword placement; a
  title with no Korean in it scores 1
- `practical_value` [0.15] — useful / actionable content for learners
- `outline_feasibility` [0.05] — can be written as a complete post *of its
  depth*. A brief topic is one or two sections by design and is not marked down
  for being short; without depth in the input, its one-point preview read as
  thin and pushed it below the score the scheduler draws from
- `uniqueness` [0.05] — differentiated from the batch and from what the seed has
  already covered

### Why search_demand carries the most weight

Every other criterion judges the topic *as described* — is it clear, is it
narrow, is it useful. A candidate can score well on all of them and still be one
nobody searches for, and that is what a run started producing once the scheduler
took over topic selection from a human.

The seed `just like that` returned ten angles — practising speaking rhythm,
using it in an English diary, in a business email, in IELTS — every one of them
scoring 7.0 or better, and not one of them a phrase anybody types. The top of
that batch reached review with 8.4 and no weaknesses recorded. Nothing in the
rubric asked the only question that mattered.

The rubric was built to *rank* a batch, and the scheduler uses it to *gatekeep*.
Rank 1 of ten inventions is still an invention, so the prompt now anchors
`search_demand` against how people search, calls for the low end of the scale to
be used, and makes a score of 5 or below a `drop` regardless of the rest.

**Output** — parsed JSON array:

**Output** — parsed JSON array:
```typescript
Array<{
  id: string
  overall_score: number       // weighted average, e.g. 8.9
  rank: number                // 1 = best
  evaluation: {
    search_demand: number
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

### Method: `generateOutline(input)`

**Input**
```typescript
{
  title: string
  keyword: string
  searchIntent: string | null
  targetReader: string | null
  outlinePreview: string[] | null  // hints from candidate generation
  depth: ArticleDepth              // resolved; undecided is standard
}
```

The prompt is built by `buildOutlinePrompt` in `article-outline-prompt.ts`.

**Prompt requirements**:
- Sections and FAQs by depth — `OUTLINE_SHAPES` in `article-outline-prompt.ts`:
  brief asks for 1–2 sections and at most one FAQ; standard for exactly 3
  sections and 1–2 FAQs, word for word what every outline was asked for before
- All section titles and FAQ items in Korean
- Keep English vocabulary and SEO terms in English within Korean sentences
- Sections must not overlap in content; FAQ must not repeat section topics

**Output** — parsed JSON; the processor adds `depth` before storing it:
```typescript
{
  title: string
  keyword: string
  searchIntent: string
  sections: string[]  // 1–2 for brief, 3 for standard
  faqs: string[]      // 0–1 for brief, 1–2 for standard
  depth?: ArticleDepth // set by the pipeline, absent on older outlines
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
  depth: ArticleDepth      // from the outline, not the candidate
}
```

The prompt is built by `buildContentPrompt` in `article-content-prompt.ts`.

**Content requirements**:
- Audience: Korean English learners
- Tone: friendly, practical, educational (not academic)
- Length by depth — `CONTENT_LENGTHS` in `article-content-prompt.ts`:
  brief 800–1,200 Korean characters (hard max 1,500); standard 1,800–2,500
  (hard max 3,000)
- An outline with no FAQs gets no FAQ block, and is told not to add one
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

The prompt is built by `buildHashtagsPrompt` in `article-content-prompt.ts`.

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

---

## Article depth

`ArticleDepth` — `brief` or `standard` — is how much an article has to say to
satisfy the search behind it. It is not the reader's level: a beginner question
can need several sections, and an advanced one can be answered in one.

| | brief | standard |
|---|---|---|
| Topic | an answer to use right away: one expression's meaning, or the few ways to say one Korean phrase | the difference itself is the question, or the meaning shifts with context |
| Example | 수고하셨습니다 영어로, 확인 부탁드립니다 영어로, otherwise 품사 | adapt vs adopt 차이, say / tell / speak / talk 차이, otherwise 뜻과 사용법 |
| Outline | 1–2 sections, at most 1 FAQ | exactly 3 sections, 1–2 FAQs |
| Length | 800–1,200 chars (max 1,500) | 1,800–2,500 chars (max 3,000) |

The test is whether the reader only has to pick an answer (brief) or has to
learn to tell things apart (standard). A list of several expressions is still
brief when the reader picks one. The first version of the rule called that a
comparison, so the main topic of every "X 영어로" seed came out standard and
brief articles came only from its side topics - which one-article-per-seed then
all but ruled out, since the main topic scores highest.

Decided once, when the candidate is generated, and carried forward:

1. **Generation** asks for it and stores it on the candidate. An unusable answer
   is stored as null, so a stored candidate shows whether depth was decided
2. **Evaluation** receives it, so a brief candidate is not marked down as thin
3. **Outline** resolves it (null → standard), builds the matching shape, and
   records `depth` on the stored outline
4. **Content** takes depth from the outline, so the length follows the structure
   the article is actually written to

Standard is exactly the shape and length every article had before depth
existed, and anything undecided is built as standard — the candidates already in
the pool when this shipped come out as they would have. The fixed shape was the
problem it replaces: an outline asked for three sections regardless of topic, so
a one-point question was padded out to fill them.
