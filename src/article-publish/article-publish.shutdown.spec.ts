import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Queue, Worker } from 'bullmq';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticlePublishRecordEntity } from './article-publish-record.entity';
import { ArticlePublishProcessor } from './article-publish.processor';
import { ARTICLE_PUBLISH_QUEUE } from './constants';
import { TistorySessionService } from './tistory/tistory-session.service';

// Keeps playwright out of the test run; no job here reaches the browser
jest.mock('./tistory/tistory-automation', () => ({
  runTistoryPublish: jest.fn(),
}));

/** What happened during shutdown, in order - written by the fakes below */
const mockEvents: string[] = [];

// The session connection, cut down to what the service calls. Like ioredis it
// rejects every command once it has been quit.
jest.mock('ioredis', () => ({
  __esModule: true,
  default: class {
    private closed = false;

    private assertOpen(): void {
      if (this.closed) throw new Error('Connection is closed.');
    }

    async get() {
      this.assertOpen();
      return null;
    }

    async set() {
      this.assertOpen();
      mockEvents.push('session saved');
      return 'OK';
    }

    async quit() {
      this.assertOpen();
      this.closed = true;
      mockEvents.push('session connection quit');
      return 'OK';
    }

    disconnect() {
      this.closed = true;
    }
  },
}));

/** Resolves when the in-flight job's browser run is over */
let finishBrowserRun: () => void;

/**
 * Stands in for BullMQ's Worker, which the real BullExplorer creates for the
 * processor and closes on shutdown. Like the real one, close() waits for the
 * active job and hands a second caller the first call's promise. The job's
 * browser run only ends once close() has been called, so the job is still
 * mid-publish when shutdown starts - a redeploy's SIGTERM.
 */
class FakeWorker {
  static latest: FakeWorker;
  private active: Promise<unknown> | undefined;
  private closing: Promise<void> | undefined;

  constructor(readonly name: string) {
    FakeWorker.latest = this;
  }

  run(work: () => Promise<unknown>): Promise<unknown> {
    this.active = work();
    return this.active;
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      mockEvents.push('worker closing');
      finishBrowserRun();
      await this.active?.catch(() => undefined);
      mockEvents.push('worker closed');
    })();
    return this.closing;
  }
}

/** Stands in for BullMQ's Queue so registerQueue opens no connection */
class FakeQueue {
  constructor(readonly name: string) {}

  async close(): Promise<void> {}
}

/**
 * The same shape as the app: ArticlePublishModule's processor and session
 * store under a root that also holds BullModule's global core. Built per test
 * because registerQueue reads the queue class when it is called.
 */
function createAppModule() {
  @Module({
    imports: [BullModule.registerQueue({ name: ARTICLE_PUBLISH_QUEUE })],
    providers: [
      ArticlePublishProcessor,
      TistorySessionService,
      { provide: getRepositoryToken(ArticleDraftEntity), useValue: {} },
      { provide: getRepositoryToken(ArticlePublishRecordEntity), useValue: {} },
      {
        provide: ConfigService,
        useValue: { get: (_key: string, fallback: unknown) => fallback },
      },
    ],
  })
  class PublishModule {}

  @Module({
    imports: [BullModule.forRoot({ connection: {} }), PublishModule],
  })
  class AppModule {}

  return AppModule;
}

describe('ArticlePublishProcessor shutdown', () => {
  beforeAll(() => {
    BullModule.queueClass = FakeQueue as unknown as typeof Queue;
    BullModule.workerClass = FakeWorker as unknown as typeof Worker;
  });

  afterAll(() => {
    BullModule.queueClass = Queue;
    BullModule.workerClass = Worker;
  });

  beforeEach(() => {
    mockEvents.length = 0;
  });

  it('drains the publish worker before closing the session store', async () => {
    const app = await NestFactory.createApplicationContext(createAppModule(), {
      logger: false,
      abortOnError: false,
    });
    const sessions = app.get(TistorySessionService);

    // What a publish does with the store: read it, drive the browser, then
    // save the session the browser refreshed
    const job = FakeWorker.latest.run(async () => {
      await sessions.getSession();
      await new Promise<void>((resolve) => (finishBrowserRun = resolve));
      await sessions.saveSession({ cookies: [] });
    });

    // Runs the same hook sequence as the SIGTERM handler enableShutdownHooks()
    // installs, just without killing the process afterwards
    await app.close();

    await expect(job).resolves.toBeUndefined();
    expect(mockEvents).toEqual([
      'worker closing',
      'session saved',
      'worker closed',
      'session connection quit',
    ]);
  });
});
