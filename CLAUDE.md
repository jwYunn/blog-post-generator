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
- `TopicCandidate` approval is transactional, and re-approving never restarts a
  draft that has moved past `failed` - a finished or published article must not
  be overwritten by a second approval
- A publish attempt is recorded before the browser runs, not after it succeeds;
  an attempt left unresolved blocks republishing until a human clears it
- Content is written for Korean English learners (Korean UI + English examples)
- Environment variables are loaded via `ConfigService` — never access `process.env` directly
- Every queue processor records its progress on the job itself, not only to the
  Nest logger — see Queue Logging below

## Queue Logging

Processors write to the **job's own log** (`job.log`) through the helpers in
`src/common/queue/job-log.util.ts`. Bull Board renders these lines when a job is
opened at `/queues`, and they outlive the container logs, which roll at 10MB × 3
— by the time anyone opens a failed job stdout has usually moved on, while the
job itself is retained for a week.

- `jobStep(job, percent, message)` at each stage boundary — writes the line and
  moves the progress bar
- `jobLog(job, message)` for detail between boundaries
- `jobFailed(job, error)` in every `catch`, before the error is rethrown
- All three swallow their own errors: a lost log line must never fail a job, and
  never replace the error being reported

**A new queue gets the same treatment.** What its lines should carry:

- **Identifiers** that tie the job back to rows — draft id, seed id, record id,
  permalink, and the id of any job it enqueues next, which is what lets someone
  follow one article across queues
- **Quantities** — candidates returned, sections in the outline, characters of
  content, bytes uploaded. Prefer the number someone would otherwise have to
  query the database to find
- **The external call about to happen**, named with its model or service, so a
  job stuck on a slow API shows where it is stuck
- **Anything irreversible**, written before it happens rather than after
- **Early returns.** A processor that returns without doing its work still
  completes successfully, so say why — otherwise the job looks like it ran

Avoid lines that only announce that a step started or finished; the progress
number already says that. Work that happens inside a helper (the Tistory browser
automation, for instance) reports back through a callback so its milestones land
on the job too.
