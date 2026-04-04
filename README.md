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
- **Browser automation publishing** — Playwright automates Tistory blog login, content insertion, and post submission
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
| Publishing | Playwright (headless browser automation) |
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

- Node.js 20+
- Docker (for PostgreSQL + Redis)

### Setup

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
npm install

# Run database migrations
npm run migration:run

# Start the server
npm run start:dev
```

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
| `TISTORY_BLOG_NAME` | Target Tistory blog name |

### Queue Monitoring

Bull Board is available at `http://localhost:3000/queues` when the server is running.

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

## Frontend

The React admin UI lives in a separate repository: [blog-post-generator-fe](https://github.com/jwYunn/blog-post-generator-fe)
