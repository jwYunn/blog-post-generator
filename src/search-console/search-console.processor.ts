import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { jobFailed, jobLog, jobStep } from '../common/queue/job-log.util';
import { SearchConsoleClient } from './search-console.client';
import { SearchConsoleService } from './search-console.service';
import {
  GSC_ROW_LIMIT,
  SEARCH_CONSOLE_QUEUE,
  STRIKING_DISTANCE_MAX,
  STRIKING_DISTANCE_MIN,
} from './search-console.constants';

interface SyncPayload {
  /** Set when a person triggered the run instead of the schedule */
  manual?: boolean;
}

/**
 * Pulls the last four weeks of Search Analytics into `search_console_queries`
 * and links each row to the seed it belongs to.
 *
 * Collection only: nothing here changes what gets written or in what order.
 * Which candidate the pipeline picks is a decision that needs this data to
 * exist first, and it does not exist yet - a rule chosen before there is
 * anything to look at is a guess.
 */
@Processor(SEARCH_CONSOLE_QUEUE, { concurrency: 1 })
export class SearchConsoleProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchConsoleProcessor.name);

  constructor(
    private readonly searchConsoleService: SearchConsoleService,
    private readonly client: SearchConsoleClient,
  ) {
    super();
  }

  async process(job: Job<SyncPayload>): Promise<void> {
    try {
      // Not an error: the credentials are optional so the app boots without
      // them. A run that does nothing still completes, so it has to say why.
      if (!this.client.isConfigured()) {
        await jobStep(
          job,
          100,
          'GSC_SITE_URL / GSC_SERVICE_ACCOUNT_JSON not set - nothing synced',
        );
        return;
      }

      const window = this.searchConsoleService.window();
      const siteUrl = this.client.describeSite();

      await jobStep(
        job,
        5,
        `${job.data?.manual ? 'manual' : 'scheduled'} sync of ${siteUrl}, ` +
          `window ${window.startDate}..${window.endDate}`,
      );

      await jobStep(
        job,
        20,
        'calling Search Console searchAnalytics.query (dimensions: query, page)',
      );

      const { rows, truncated } = await this.client.fetchQueryPageRows(
        window.startDate,
        window.endDate,
      );

      const queries = new Set(rows.map((row) => row.query)).size;
      const pages = new Set(rows.map((row) => row.page)).size;
      await jobLog(
        job,
        `received ${rows.length} rows (${queries} queries, ${pages} pages)`,
      );

      if (truncated) {
        await jobLog(
          job,
          `WARNING: response came back at the ${GSC_ROW_LIMIT}-row API ceiling, ` +
            'so rows were dropped - this sync needs paging now',
        );
      }

      if (rows.length === 0) {
        await jobStep(
          job,
          100,
          'no rows for this window - nothing is ranking yet, or the property is wrong',
        );
        return;
      }

      await this.searchConsoleService.saveRows(rows, window);
      await jobStep(
        job,
        70,
        `stored ${rows.length} rows for ${window.endDate}`,
      );

      const { matchedRows, unmatchedRows, distinctSeeds } =
        await this.searchConsoleService.matchSeeds(window);
      await jobLog(
        job,
        `matched ${matchedRows} rows to ${distinctSeeds} seed(s); ` +
          `${unmatchedRows} matched no seed`,
      );

      const striking =
        await this.searchConsoleService.countStrikingDistance(window);
      await jobStep(
        job,
        100,
        `done - ${striking} queries in striking distance ` +
          `(position ${STRIKING_DISTANCE_MIN}-${STRIKING_DISTANCE_MAX})`,
      );
    } catch (error) {
      await jobFailed(job, error);
      throw error;
    }
  }
}
