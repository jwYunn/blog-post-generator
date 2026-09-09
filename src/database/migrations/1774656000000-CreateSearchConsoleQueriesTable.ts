import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSearchConsoleQueriesTable1774656000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE search_console_queries (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query             VARCHAR(200) NOT NULL,
        "normalizedQuery" VARCHAR(200) NOT NULL,
        page              VARCHAR(500) NOT NULL,
        "windowStart"     DATE NOT NULL,
        "windowEnd"       DATE NOT NULL,
        clicks            INT NOT NULL,
        impressions       INT NOT NULL,
        ctr               NUMERIC(6,4) NOT NULL,
        position          NUMERIC(5,2) NOT NULL,
        "topicSeedId"     UUID REFERENCES topic_seeds(id) ON DELETE SET NULL,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Makes a re-run of the same day's sync an update rather than a duplicate,
    // which is what the ON CONFLICT target in saveRows() relies on
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_search_console_queries_window_row"
      ON search_console_queries ("normalizedQuery", page, "windowEnd")
    `);

    // Every read is "the newest window", and the opportunities list filters it
    // by position on top of that
    await queryRunner.query(`
      CREATE INDEX "IDX_search_console_queries_window_position"
      ON search_console_queries ("windowEnd", position)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_search_console_queries_seed"
      ON search_console_queries ("topicSeedId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE search_console_queries`);
  }
}
