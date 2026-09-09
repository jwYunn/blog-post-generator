import { Job } from 'bullmq';
import { SearchConsoleProcessor } from './search-console.processor';
import { GSC_ROW_LIMIT } from './search-console.constants';

const WINDOW = { startDate: '2026-08-09', endDate: '2026-09-06' };

const ROWS = [
  {
    query: 'affordable 뜻',
    page: 'https://fromdeepwithin.tistory.com/105',
    clicks: 3,
    impressions: 340,
    ctr: 0.0088,
    position: 12.4,
  },
  {
    query: 'when it comes to 뜻',
    page: 'https://fromdeepwithin.tistory.com/104',
    clicks: 1,
    impressions: 120,
    ctr: 0.0083,
    position: 19.1,
  },
];

describe('SearchConsoleProcessor', () => {
  let searchConsoleService: any;
  let client: any;
  let job: Job;
  let processor: SearchConsoleProcessor;

  function buildJob(data: Record<string, unknown> = {}): Job {
    return {
      data,
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;
  }

  function jobLogText(): string {
    return (job.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
  }

  beforeEach(() => {
    searchConsoleService = {
      window: jest.fn(() => WINDOW),
      saveRows: jest.fn(async () => undefined),
      matchSeeds: jest.fn(async () => ({
        matchedRows: 1,
        unmatchedRows: 1,
        distinctSeeds: 1,
      })),
      countStrikingDistance: jest.fn(async () => 2),
    };
    client = {
      isConfigured: jest.fn(() => true),
      describeSite: jest.fn(() => 'https://fromdeepwithin.tistory.com/'),
      fetchQueryPageRows: jest.fn(async () => ({
        rows: ROWS,
        truncated: false,
      })),
    };
    job = buildJob();

    processor = new SearchConsoleProcessor(searchConsoleService, client);
  });

  describe('a normal sync', () => {
    it('stores the rows it fetched for the shifted window', async () => {
      await processor.process(job);

      expect(client.fetchQueryPageRows).toHaveBeenCalledWith(
        WINDOW.startDate,
        WINDOW.endDate,
      );
      expect(searchConsoleService.saveRows).toHaveBeenCalledWith(ROWS, WINDOW);
      expect(searchConsoleService.matchSeeds).toHaveBeenCalledWith(WINDOW);
    });

    /**
     * The run is over before anyone looks at it, so the log has to carry the
     * numbers someone would otherwise have to query the database to find.
     */
    it('records the window, the volumes and the outcome', async () => {
      await processor.process(job);

      expect(jobLogText()).toContain('2026-08-09..2026-09-06');
      expect(jobLogText()).toContain('received 2 rows (2 queries, 2 pages)');
      expect(jobLogText()).toContain('matched 1 rows to 1 seed(s)');
      expect(jobLogText()).toContain('1 matched no seed');
      expect(jobLogText()).toContain('2 queries in striking distance');
    });

    it('names the external call before making it', async () => {
      await processor.process(job);

      expect(jobLogText()).toContain('searchAnalytics.query');
    });

    it('separates a manual run from a scheduled one in the log', async () => {
      job = buildJob({ manual: true });

      await processor.process(job);

      expect(jobLogText()).toContain('manual sync');
    });
  });

  /**
   * Missing credentials are a normal state, not a fault: the settings are
   * optional so the app can deploy before they exist. The run still has to say
   * why it did nothing, or it looks like a sync that found no data.
   */
  describe('when the credentials are not set', () => {
    beforeEach(() => {
      client.isConfigured.mockReturnValue(false);
    });

    it('does nothing without failing', async () => {
      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(client.fetchQueryPageRows).not.toHaveBeenCalled();
      expect(searchConsoleService.saveRows).not.toHaveBeenCalled();
    });

    it('says why it did nothing', async () => {
      await processor.process(job);

      expect(jobLogText()).toContain('not set - nothing synced');
    });
  });

  describe('when the window comes back empty', () => {
    it('stores nothing and says so rather than looking like a success', async () => {
      client.fetchQueryPageRows.mockResolvedValue({
        rows: [],
        truncated: false,
      });

      await processor.process(job);

      expect(searchConsoleService.saveRows).not.toHaveBeenCalled();
      expect(jobLogText()).toContain('no rows for this window');
    });
  });

  /**
   * There is no paging: this blog returns a few hundred rows against a 25,000
   * ceiling. The warning is the only thing that would ever reveal that the
   * assumption stopped holding.
   */
  describe('when the response hits the API ceiling', () => {
    it('warns that rows were dropped, and still stores what came back', async () => {
      client.fetchQueryPageRows.mockResolvedValue({
        rows: ROWS,
        truncated: true,
      });

      await processor.process(job);

      expect(jobLogText()).toContain(`${GSC_ROW_LIMIT}-row API ceiling`);
      expect(searchConsoleService.saveRows).toHaveBeenCalled();
    });
  });

  describe('when the sync fails', () => {
    it('records the reason on the job and rethrows', async () => {
      client.fetchQueryPageRows.mockRejectedValue(
        new Error('Search Console refused the request (403)'),
      );

      await expect(processor.process(job)).rejects.toThrow('403');

      expect(jobLogText()).toContain('FAILED: Search Console refused');
    });
  });
});
