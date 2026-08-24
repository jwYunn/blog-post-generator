import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

/** A probe that takes longer than this is treated as a failure */
const PROBE_TIMEOUT_MS = 2_000;

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'error';
  db: DependencyStatus;
  redis: DependencyStatus;
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: configService.get<number>('REDIS_PORT', 6379),
      // Bound the retries so a dead Redis surfaces within the probe timeout.
      // The offline queue stays enabled on purpose: disabling it makes any
      // command issued before the connection is ready fail instantly, which
      // would report a healthy Redis as down on the first probe after boot.
      maxRetriesPerRequest: 1,
    });
    // Without an error listener ioredis escalates connection failures to
    // unhandled errors and takes the process down
    this.redis.on('error', () => undefined);
  }

  async check(): Promise<HealthReport> {
    const [db, redis] = await Promise.all([
      this.probe(() => this.dataSource.query('SELECT 1')),
      this.probe(() => this.redis.ping()),
    ]);

    return {
      status: db === 'up' && redis === 'up' ? 'ok' : 'error',
      db,
      redis,
    };
  }

  /** Run a probe, treating both rejection and timeout as "down" */
  private async probe(run: () => Promise<unknown>): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('probe timed out')),
        PROBE_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([run(), timeout]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // Redis was already unreachable - drop the socket instead
      this.redis.disconnect();
    }
  }
}
