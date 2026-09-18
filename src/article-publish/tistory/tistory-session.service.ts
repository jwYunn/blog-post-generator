import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TistorySessionProvider } from './tistory.types';

const TISTORY_SESSION_KEY = 'tistory:session';
const SESSION_TTL_SECONDS = 86_400; // 24 hours

@Injectable()
export class TistorySessionService implements TistorySessionProvider {
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: configService.get<number>('REDIS_PORT', 6379),
    });
  }

  async getSession(): Promise<object | null> {
    const data = await this.redis.get(TISTORY_SESSION_KEY);
    if (!data) return null;
    return JSON.parse(data);
  }

  async saveSession(state: object): Promise<void> {
    await this.redis.set(
      TISTORY_SESSION_KEY,
      JSON.stringify(state),
      'EX',
      SESSION_TTL_SECONDS,
    );
  }

  async deleteSession(): Promise<void> {
    await this.redis.del(TISTORY_SESSION_KEY);
  }

  /**
   * Called by ArticlePublishProcessor once its worker has drained, rather than
   * from a lifecycle hook here: a publish still running on SIGTERM needs this
   * store until it ends, and no hook on this class reliably runs after
   * @nestjs/bullmq has closed its workers.
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // Redis was already unreachable - drop the socket instead. Throwing here
      // would abort the rest of Nest's shutdown, other workers' drain included.
      this.redis.disconnect();
    }
  }
}
