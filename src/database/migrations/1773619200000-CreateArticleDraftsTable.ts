import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArticleDraftsTable1773619200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "article_drafts_status_enum" AS ENUM (
        'queued',
        'generating_outline',
        'outline_generated',
        'generating_content',
        'content_generated',
        'generating_thumbnail',
        'review_ready',
        'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "article_drafts" (
        "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
        "topicCandidateId"   UUID        NOT NULL,
        "title"              VARCHAR(300) NOT NULL,
        "keyword"            VARCHAR(200) NOT NULL,
        "outline"            JSONB,
        "content"            TEXT,
        "thumbnailImageUrl"  TEXT,
        "status"             "article_drafts_status_enum" NOT NULL DEFAULT 'queued',
        "errorMessage"       TEXT,
        "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_article_drafts"                    PRIMARY KEY ("id"),
        CONSTRAINT "UQ_article_drafts_topicCandidateId"   UNIQUE ("topicCandidateId"),
        CONSTRAINT "FK_article_drafts_topicCandidateId"
          FOREIGN KEY ("topicCandidateId")
          REFERENCES "topic_candidates"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_article_drafts_status" ON "article_drafts" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_article_drafts_status"`);
    await queryRunner.query(`DROP TABLE "article_drafts"`);
    await queryRunner.query(`DROP TYPE "article_drafts_status_enum"`);
  }
}
