import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArticlePublishRecordsTable1773878400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "article_publish_records" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "draftId"     UUID         NOT NULL,
        "permalink"   VARCHAR(500),
        "schedule"    JSONB,
        "meta"        JSONB,
        "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_article_publish_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_article_publish_records_draftId"
          FOREIGN KEY ("draftId")
          REFERENCES "article_drafts"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_article_publish_records_draftId"
        ON "article_publish_records" ("draftId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_article_publish_records_createdAt"
        ON "article_publish_records" ("createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_article_publish_records_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_article_publish_records_draftId"`);
    await queryRunner.query(`DROP TABLE "article_publish_records"`);
  }
}
