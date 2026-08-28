# Blog Post Generator

An AI-powered blog post generation pipeline built with NestJS. Automates the full lifecycle from topic ideation to publishing — including AI content generation, thumbnail creation, and browser-based blog publishing via Playwright.

## Overview

This system takes a simple keyword seed and produces a fully written, SEO-optimized Korean blog post, complete with a generated thumbnail image, published directly to Tistory. Each stage runs as an async background job coordinated through BullMQ and Redis.

```
Topic Seed → Candidate Generation → Evaluation → Outline → Content → Thumbnail → Publish
```

All intermediate states are persisted in PostgreSQL, making the pipeline resumable and inspectable at every stage.

## Key Features

- **Multi-model AI pipeline** — Uses Claude (Anthropic), GPT (OpenAI), and Flux (Replicate) for different tasks, each chosen for their strengths
- **Async job processing** — BullMQ + Redis with per-queue concurrency control and dead-letter handling
- **State machine workflow** — Article drafts progress through 10 explicit statuses with full error visibility
- **Browser automation publishing** — Playwright drives a remote Chromium to automate Tistory login, content insertion, and post submission
- **Image generation & processing** — Replicate Flux API for AI thumbnails + Sharp for image composition + AWS S3 for storage
- **Admin API** — RESTful endpoints consumed by a React admin frontend

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 + TypeScript 5 |
| Queue / Jobs | BullMQ 5 + Redis 7 |
| Database | PostgreSQL 16 + TypeORM 0.3 |
| AI — Text | Anthropic Claude (Opus, Sonnet, Haiku), OpenAI GPT-4o / GPT-5 |
| AI — Image | Replicate (Flux Schnell) |
| Publishing | Playwright driving a remote Chromium (browserless) |
| Image Processing | Sharp |
| Storage | AWS S3 |
| Queue UI | Bull Board (`/queues`) |

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for a full breakdown of module structure and design decisions.

## Data Flow

See [`docs/data-flow.md`](docs/data-flow.md) for the end-to-end pipeline walkthrough.

## Queue Processing

See [`docs/queue-processing.md`](docs/queue-processing.md) for queue configuration, concurrency settings, and error handling.

## Getting Started

### Prerequisites

- Node.js 22 (matches the image the server runs)
- Docker

### Setup

`docker compose up -d` brings up the whole stack — app, nginx, browserless,
PostgreSQL and Redis. To iterate on the app from source instead, stop that one
container so it releases port 3000.

```bash
cp .env.example .env   # then fill in the values below

docker compose up -d
npm install
npm run migration:run
```

```bash
docker compose stop app && npm run start:dev
```

`cloudflared` also starts, and without a `TUNNEL_TOKEN` it simply fails to
connect. That is harmless locally.

To watch the publish flow in a real browser window instead of driving the remote
one, set `BROWSER_DEBUG_LOCAL=true`. It relies on the Chromium that the
`playwright` devDependency downloads, so it only works from a checkout — never in
the production image.

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `POSTGRES_HOST` / `PORT` / `USER` / `PASSWORD` / `DB` | PostgreSQL connection |
| `REDIS_HOST` / `PORT` | Redis connection |
| `ANTHROPIC_API_KEY` | Anthropic Claude API |
| `OPENAI_API_KEY` | OpenAI GPT API |
| `REPLICATE_API_TOKEN` | Replicate (Flux image generation) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` / `AWS_REGION` | AWS S3 for image storage |
| `KAKAO_ID` / `KAKAO_PASSWORD` | Kakao credentials for Tistory login |
| `TISTORY_BLOG_NAME` | Target Tistory blog name — **required, the app will not boot without it** |
| `BROWSERLESS_URL` | Remote browser endpoint — **required unless `BROWSER_DEBUG_LOCAL=true`**. Must be the Playwright-protocol path (`/chromium/playwright`), not the CDP one, because session restore goes through `newContext({ storageState })` |
| `BROWSER_DEBUG_LOCAL` | `true` launches a visible browser locally and ignores `BROWSERLESS_URL` |
| `CORS_ORIGIN` | Frontend origin. Irrelevant in production, where nginx serves both from one origin, but a stale value blocks every request if that ever changes |
| `TUNNEL_TOKEN` | Server only — binds `cloudflared` to the Cloudflare Tunnel |

Compose overrides `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, `REDIS_PORT`
and `BROWSERLESS_URL` with in-network addresses, so one `.env` serves both a
local checkout and the server. The host ports compose publishes are separate
settings (`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`) — shifting one to dodge a
local conflict must not follow the app into its container.

### Queue Monitoring

Bull Board is available at `http://localhost:3000/queues` when the server is running.

### Tests

```bash
npm test
```

Unit tests sit next to the code they cover, as `*.spec.ts` under `src/`. The CI
gate runs them before an image is built, so a failing test stops the deploy.

What they cover is the decisions that are expensive to get wrong rather than
whatever is easiest to reach:

- **The two guards.** A second approval must not regenerate an article that is
  already finished or live, and a failed publish must be classified by whether
  anything can have reached the blog — the difference between a safe retry and a
  duplicate post.
- **Every queue processor.** Each one is driven through its status transitions,
  the job it queues next, and what it leaves behind when it fails. The early
  returns are covered too: a processor that declines a job still completes, so
  the test asserts it said why.
- **The response parsers.** Models return the same payload fenced one day and
  bare the next, so `parseJsonResponse` is tested against both, against prose
  either side of the payload, and against a list handed back inside an object.
- **The pure functions.** The category tag round trip, which the thumbnail
  overlay and the image alt text both depend on; the conditional
  `BROWSERLESS_URL` requirement; and the HTML body builder.

Nothing here reaches Postgres, Redis, a browser or an AI provider — repositories
and queues are stubbed and the Tistory automation is mocked, so the suite runs
on a bare checkout in a few seconds.

> [!NOTE]
> `marked` is ESM-only. The app gets away with `require`-ing it because Node 22
> resolves ESM from CommonJS, but Jest's runtime does not, so the jest block in
> `package.json` transforms that one package rather than skipping `node_modules`
> wholesale.

## API Reference

### Topic Seeds

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/topic-seeds` | List seeds (paginated, filterable) |
| `POST` | `/topic-seeds` | Create a new seed |
| `PATCH` | `/topic-seeds/:id` | Update seed |
| `DELETE` | `/topic-seeds/:id` | Soft delete |
| `POST` | `/topic-seeds/:id/generate` | Queue topic generation job |
| `POST` | `/topic-seeds/:id/evaluate` | Queue topic evaluation job |
| `GET` | `/topic-seeds/:id/candidates` | List generated candidates |

### Topic Candidates

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/topic-candidates` | List candidates with filters |
| `PATCH` | `/topic-candidates/:id/status` | Approve or reject a candidate |

### Article Drafts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/article-drafts` | List drafts (status filter, pagination) |
| `GET` | `/article-drafts/:id` | Get draft detail |
| `POST` | `/article-drafts/:id/publish` | Trigger publish job |
| `GET` | `/article-drafts/:id/publish-records` | Get publish history for a draft |

### Publish Records

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/article-publish-records` | List all publish records (paginated) |

### Thumbnail Generator

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/thumbnail-generator/generate` | Queue Flux image generation |
| `GET` | `/thumbnail-generator` | List prompts with status |
| `GET` | `/thumbnail-generator/:id` | Get prompt + generation status |
| `GET` | `/thumbnail-generator/:id/images` | Get generated images |
| `PATCH` | `/thumbnail-generator/mappings/:id` | Toggle image active flag |

## Deployment

Pushing to `main` builds an image, pushes it to GHCR, and deploys it to the VPS
(`.github/workflows/deploy.yml`). The pipeline gates on lint, build and test
first, so a broken commit never reaches the deploy job.

The site sits behind a Cloudflare Tunnel with Access in front of it, which means
the server publishes no inbound port for it. See the Infra doc in Notion for the
full picture.

### Rolling back

Every deploy publishes a `sha-<commit>` tag, so any previous build can be brought
back by name. Tags are listed on the repository's GHCR package page.

```bash
APP_IMAGE=ghcr.io/jwyunn/blog-post-generator:sha-abc1234 docker compose up -d app
```

Run it from `DEPLOY_PATH` on the server. Compose recreates only `app`; the other
services keep running.

> [!WARNING]
> **Migrations do not roll back with the image.** Reverting to an older image
> leaves the database on the newer schema, and the older code has no idea the
> newer columns exist. Additive migrations usually survive this; anything that
> renamed, dropped or retyped a column will not. Check what the newer commit
> migrated before rolling back, and revert the migration separately if needed.

Because the deploy pins the exact commit's tag rather than `:latest`, re-running
the pipeline on the previous commit is the other way back — and it is the one
that keeps the server and the repository in agreement.

### Operations

Commands run from `DEPLOY_PATH` on the server.

```bash
docker compose exec -T app npm run migration:run:prod
```

```bash
docker compose exec -T app node < deploy/kakao-probe.js
```

The second checks whether Tistory still accepts the saved session without
publishing anything — the session expires every 24 hours. Add `-e PROBE_LOGIN=1`
to actually attempt the login. On failure it prints the landing URL and page
text, which is what separates a blocked IP from a changed selector.

## Frontend

The React admin UI lives in a separate repository: [blog-post-generator-fe](https://github.com/jwYunn/blog-post-generator-fe)
