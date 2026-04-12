# Blog Post Generator — Backend

NestJS backend that automates blog post creation from keyword seeds through AI generation, evaluation, and Tistory publishing.

## Tech Stack

- **Framework**: NestJS 10 + TypeScript
- **Database**: PostgreSQL + TypeORM 0.3
- **Queue**: BullMQ + Redis
- **AI**: Anthropic Claude, OpenAI GPT, Replicate (image)
- **Storage**: AWS S3
- **Publishing**: Tistory (via Playwright automation)

## Documentation

Read these files to understand the system before suggesting features or changes:

- [Overview & Architecture](docs/overview.md) — pipeline flow, module map, entity relationships
- [Queue & Job Reference](docs/queues.md) — all BullMQ queues, job payloads, processor steps
- [Database Schema](docs/entities.md) — all entities, columns, enums, migrations
- [AI Services](docs/ai-services.md) — models used, prompts, inputs/outputs per service
- [API Endpoints](docs/api-endpoints.md) — all REST endpoints with request/response shapes

## Language Rules

- **Commit messages**: English only
- **Code comments**: English only
- **Variable/function/class names**: English only
- **Console logs and error messages**: English only

## Key Conventions

- All queue names and job names are defined as constants (not magic strings)
- Article draft status transitions are strictly sequential; processors update status at each step
- `TopicCandidate` approval is transactional: approving one rejects all siblings
- Content is written for Korean English learners (Korean UI + English examples)
- Environment variables are loaded via `ConfigService` — never access `process.env` directly
