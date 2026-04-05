import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TistorySessionProvider } from './tistory.types';

const TISTORY_SESSION_KEY = 'tistory:session';
const SESSION_TTL_SECONDS = 86_400; // 24 hours

@Injectable()
export class TistorySessionService implements TistorySessionProvider, OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
