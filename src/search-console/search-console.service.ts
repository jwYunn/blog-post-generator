import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { SearchConsoleQueryEntity } from './search-console-query.entity';
import { SearchConsoleClient, SearchConsoleRow } from './search-console.client';
import {
  DATA_LAG_DAYS,
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_SYNC_CRON,
  DEFAULT_SYNC_TZ,
  SEARCH_CONSOLE_QUEUE,
  SEARCH_CONSOLE_SCHEDULER_ID,
  STRIKING_DISTANCE_MAX,
  STRIKING_DISTANCE_MIN,
  SYNC_SEARCH_CONSOLE_JOB,
  UPSERT_CHUNK_SIZE,
} from './search-console.constants';

export interface SearchConsoleSettings {
  cron: string;
  timezone: string;
  lookbackDays: number;
}

export interface SearchConsoleSchedule extends SearchConsoleSettings {
  /** False until both GSC settings are on the server; the sync no-ops until then */
  configured: boolean;
  siteUrl: string | null;
  /** When the schedule fires next, or null if it is not registered */
  nextRunAt: string | null;
}

export interface SyncWindow {
  startDate: string;
  endDate: string;
}

export interface SeedMatchResult {
  matchedRows: number;
  unmatchedRows: number;
  distinctSeeds: number;
}

export interface OpportunityRow {
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  position: number;
  seed: string | null;
}

/** Reads a numeric setting, ignoring a value that is not a usable number */
function readNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(parsed)
    ? parsed
    : fallback;
}

/** YYYY-MM-DD, the only date format the Search Analytics API accepts */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class SearchConsoleService implements OnModuleInit {
  private readonly logger = new Logger(SearchConsoleService.name);

  constructor(
    @InjectQueue(SEARCH_CONSOLE_QUEUE)
    private readonly syncQueue: Queue,
    @InjectRepository(SearchConsoleQueryEntity)
    private readonly queryRepository: Repository<SearchConsoleQueryEntity>,
    private readonly client: SearchConsoleClient,
    private readonly configService: ConfigService,
  ) {}

  /**
   * The schedule is registered whether or not the credentials are present, so
   * that turning the sync on is purely an .env change - no code path differs,
   * and the skipped runs in Bull Board are the evidence it was waiting.
   */
  async onModuleInit(): Promise<void> {
    const { cron, timezone } = this.settings();

    await this.syncQueue.upsertJobScheduler(
      SEARCH_CONSOLE_SCHEDULER_ID,
      { pattern: cron, tz: timezone },
      { name: SYNC_SEARCH_CONSOLE_JOB, data: {} },
    );

    this.logger.log(
      `Search Console sync scheduled at "${cron}" (${timezone})` +
        (this.client.isConfigured() ? '' : ' - credentials not set, will skip'),
    );
  }

  settings(): SearchConsoleSettings {
    return {
      cron: this.configService.get<string>('GSC_SYNC_CRON', DEFAULT_SYNC_CRON),
      timezone: this.configService.get<string>('GSC_SYNC_TZ', DEFAULT_SYNC_TZ),
      lookbackDays: readNumber(
        this.configService.get<string>('GSC_LOOKBACK_DAYS'),
        DEFAULT_LOOKBACK_DAYS,
      ),
    };
  }

  async describeSchedule(): Promise<SearchConsoleSchedule> {
    const schedulers = await this.syncQueue.getJobSchedulers();
    const entry = schedulers.find(
      (scheduler) => scheduler.key === SEARCH_CONSOLE_SCHEDULER_ID,
    );
    const configured = this.client.isConfigured();

    return {
      ...this.settings(),
      configured,
      siteUrl: configured ? this.client.describeSite() : null,
      nextRunAt: entry?.next ? new Date(entry.next).toISOString() : null,
    };
  }

  /** Run the sync now, without waiting for the schedule */
  async runNow(): Promise<{ jobId: string }> {
    const job = await this.syncQueue.add(SYNC_SEARCH_CONSOLE_JOB, {
      manual: true,
    });
    return { jobId: String(job.id) };
  }

  /**
   * The window to ask for, shifted back by the lag: Search Console finalises a
   * day two to three days later, so a window ending today reads near-zero at
   * its end and pulls the average position down with it.
   */
  window(now: Date = new Date()): SyncWindow {
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - DATA_LAG_DAYS);

    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - this.settings().lookbackDays);

    return { startDate: isoDate(start), endDate: isoDate(end) };
  }

  private normalize(value: string): string {
    return value.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Writes the window's rows, replacing any already stored for the same window.
   * Re-running a sync on the same day is therefore free, which matters because
   * the manual endpoint invites exactly that.
   */
  async saveRows(rows: SearchConsoleRow[], window: SyncWindow): Promise<void> {
    const deduped = this.dedupeByConflictKey(rows);

    for (let i = 0; i < deduped.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = deduped.slice(i, i + UPSERT_CHUNK_SIZE).map((row) => ({
        query: row.query.slice(0, 200),
        normalizedQuery: this.normalize(row.query).slice(0, 200),
        page: row.page.slice(0, 500),
        windowStart: window.startDate,
        windowEnd: window.endDate,
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        ctr: row.ctr,
        position: row.position,
      }));

      await this.queryRepository
        .createQueryBuilder()
        .insert()
        .values(chunk)
        .orUpdate(
          ['query', 'windowStart', 'clicks', 'impressions', 'ctr', 'position'],
          ['normalizedQuery', 'page', 'windowEnd'],
        )
        .execute();
    }
  }

  /**
   * Collapses rows that would land on the same unique key.
   *
   * Postgres refuses an ON CONFLICT DO UPDATE that touches one row twice in a
   * single statement, and it fails the whole statement rather than the row - so
   * two queries differing only in case or spacing would take the sync down with
   * them. The larger of the pair is kept, being the one worth seeing.
   */
  private dedupeByConflictKey(rows: SearchConsoleRow[]): SearchConsoleRow[] {
    const byKey = new Map<string, SearchConsoleRow>();

    for (const row of rows) {
      const key = `${this.normalize(row.query)}\u0000${row.page}`;
      const seen = byKey.get(key);
      if (!seen || row.impressions > seen.impressions) {
        byKey.set(key, row);
      }
    }

    return [...byKey.values()];
  }

  /**
   * Links each row to the seed it belongs to. The longest matching seed wins,
   * so "when it comes to" beats a shorter seed that happens to sit inside the
   * same query; `position()` rather than LIKE, so a seed containing % or _ is
   * matched literally instead of as a wildcard.
   *
   * Rows left null are the queries no seed covers - the raw material for a
   * later stage, and the number that says whether matching needs to get
   * cleverer than a substring.
   */
  async matchSeeds(window: SyncWindow): Promise<SeedMatchResult> {
    await this.queryRepository.query(
      `
      UPDATE search_console_queries scq
      SET "topicSeedId" = (
        SELECT s.id
        FROM topic_seeds s
        WHERE s."deletedAt" IS NULL
          AND length(s."normalizedSeed") > 0
          AND position(s."normalizedSeed" IN scq."normalizedQuery") > 0
        ORDER BY length(s."normalizedSeed") DESC
        LIMIT 1
      )
      WHERE scq."windowEnd" = $1
      `,
      [window.endDate],
    );

    // Counted off the stored rows rather than the fetched ones: a re-sync that
    // returns fewer rows leaves the earlier ones in place, and subtracting one
    // from the other would go negative.
    const { matched, unmatched, seeds } = (await this.queryRepository
      .createQueryBuilder('scq')
      .select(
        'COUNT(*) FILTER (WHERE scq."topicSeedId" IS NOT NULL)',
        'matched',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE scq."topicSeedId" IS NULL)',
        'unmatched',
      )
      .addSelect('COUNT(DISTINCT scq.topicSeedId)', 'seeds')
      .where('scq.windowEnd = :endDate', { endDate: window.endDate })
      .getRawOne<{ matched: string; unmatched: string; seeds: string }>()) ?? {
      matched: '0',
      unmatched: '0',
      seeds: '0',
    };

    return {
      matchedRows: Number(matched),
      unmatchedRows: Number(unmatched),
      distinctSeeds: Number(seeds),
    };
  }

  /** How many of the window's queries sit in striking distance */
  async countStrikingDistance(window: SyncWindow): Promise<number> {
    return this.queryRepository
      .createQueryBuilder('scq')
      .where('scq.windowEnd = :endDate', { endDate: window.endDate })
      .andWhere('scq.position BETWEEN :min AND :max', {
        min: STRIKING_DISTANCE_MIN,
        max: STRIKING_DISTANCE_MAX,
      })
      .getCount();
  }

  /**
   * The point of the whole sync: what is ranked closely enough that another
   * article on the subject could push it onto the first page, most-seen first.
   * Always reads the newest window, so it answers "as of now" without a date.
   */
  async listOpportunities(limit: number): Promise<OpportunityRow[]> {
    const rows = await this.queryRepository
      .createQueryBuilder('scq')
      .leftJoin('scq.topicSeed', 'seed')
      .select([
        'scq.query AS query',
        'scq.page AS page',
        'scq.impressions AS impressions',
        'scq.clicks AS clicks',
        'scq.position AS position',
        'seed.seed AS seed',
      ])
      .where(
        'scq.windowEnd = (SELECT MAX(latest."windowEnd") FROM search_console_queries latest)',
      )
      .andWhere('scq.position BETWEEN :min AND :max', {
        min: STRIKING_DISTANCE_MIN,
        max: STRIKING_DISTANCE_MAX,
      })
      .orderBy('scq.impressions', 'DESC')
      .limit(limit)
      .getRawMany<{
        query: string;
        page: string;
        impressions: string;
        clicks: string;
        position: string;
        seed: string | null;
      }>();

    return rows.map((row) => ({
      query: row.query,
      page: row.page,
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      position: Number(row.position),
      seed: row.seed,
    }));
  }
}
