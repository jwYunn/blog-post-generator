import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import { GSC_ROW_LIMIT } from './search-console.constants';

/** One query/page pair, flattened out of the API's parallel keys array */
export interface SearchConsoleRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleFetchResult {
  rows: SearchConsoleRow[];
  /** True when the response came back at the API ceiling, so rows were dropped */
  truncated: boolean;
}

interface SearchAnalyticsResponse {
  rows?: {
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

/**
 * Reads Search Analytics out of Search Console.
 *
 * Deliberately not the `googleapis` package: that ships every Google API and
 * weighs tens of megabytes, and this needs exactly one POST. `google-auth-
 * library` signs the request; Node 22's own fetch, wrapped by the JWT client,
 * makes it.
 */
@Injectable()
export class SearchConsoleClient {
  private readonly logger = new Logger(SearchConsoleClient.name);
  private jwt: JWT | null = null;

  constructor(private readonly configService: ConfigService) {}

  private siteUrl(): string {
    return (this.configService.get<string>('GSC_SITE_URL') ?? '').trim();
  }

  private rawKey(): string {
    return (
      this.configService.get<string>('GSC_SERVICE_ACCOUNT_JSON') ?? ''
    ).trim();
  }

  /**
   * Whether both settings are present. The sync is optional: the app has to
   * boot without them, so this is checked at run time rather than in
   * env.validation, and the processor returns early when it is false.
   */
  isConfigured(): boolean {
    return this.siteUrl().length > 0 && this.rawKey().length > 0;
  }

  /** The property the rows describe, for the job log */
  describeSite(): string {
    return this.siteUrl();
  }

  /**
   * The key is accepted either as raw JSON or base64-encoded. A service account
   * key is a single line of JSON full of quotes and `\n` escapes, which several
   * layers between here and the file - dotenv, compose, a shell - each get to
   * mangle; base64 survives all of them.
   */
  private credentials(): ServiceAccountKey {
    const raw = this.rawKey();
    const json = raw.startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');

    let parsed: ServiceAccountKey;
    try {
      parsed = JSON.parse(json) as ServiceAccountKey;
    } catch {
      throw new Error(
        'GSC_SERVICE_ACCOUNT_JSON is neither JSON nor base64-encoded JSON',
      );
    }

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        'GSC_SERVICE_ACCOUNT_JSON is missing client_email or private_key',
      );
    }

    return parsed;
  }

  private client(): JWT {
    if (!this.jwt) {
      const { client_email, private_key } = this.credentials();
      this.jwt = new JWT({
        email: client_email,
        key: private_key,
        scopes: [SCOPE],
      });
      this.logger.log(`Search Console client ready as ${client_email}`);
    }
    return this.jwt;
  }

  /**
   * Rows for the window, one per query/page pair.
   *
   * A 403 here almost always means the service account was never added as a
   * user on the property, so it is worth saying so rather than passing the bare
   * status up.
   */
  async fetchQueryPageRows(
    startDate: string,
    endDate: string,
  ): Promise<SearchConsoleFetchResult> {
    const site = encodeURIComponent(this.siteUrl());
    const url = `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`;

    let response;
    try {
      response = await this.client().request<SearchAnalyticsResponse>({
        url,
        method: 'POST',
        data: {
          startDate,
          endDate,
          dimensions: ['query', 'page'],
          rowLimit: GSC_ROW_LIMIT,
        },
      });
    } catch (error) {
      throw new Error(this.explain(error));
    }

    const rows = (response.data.rows ?? []).map((row) => ({
      query: row.keys[0] ?? '',
      page: row.keys[1] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));

    return { rows, truncated: rows.length >= GSC_ROW_LIMIT };
  }

  /** Turns the two failures that actually happen into something actionable */
  private explain(error: unknown): string {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: unknown }).status)
        : undefined;
    const message = error instanceof Error ? error.message : String(error);

    if (status === 403) {
      return `Search Console refused the request for ${this.siteUrl()} (403). The service account is probably not a user on this property - add its email under Settings > Users and permissions. (${message})`;
    }
    if (status === 404) {
      return `Search Console does not know the property ${this.siteUrl()} (404). A URL-prefix property must end in a slash; a domain property looks like "sc-domain:example.com". (${message})`;
    }
    return `Search Console request failed: ${message}`;
  }
}
