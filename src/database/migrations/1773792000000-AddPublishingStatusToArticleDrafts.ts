import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublishingStatusToArticleDrafts1773792000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "article_drafts_status_enum"
      ADD VALUE IF NOT EXISTS 'publishing'
    `);
    await queryRunner.query(`
      ALTER TYPE "article_drafts_status_enum"
      ADD VALUE IF NOT EXISTS 'published'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly; recreate the type instead
    await queryRunner.query(`
      ALTER TABLE "article_drafts"
        ALTER COLUMN "status" TYPE VARCHAR(50)
    `);
    await queryRunner.query(`DROP TYPE "article_drafts_status_enum"`);
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
      ALTER TABLE "article_drafts"
        ALTER COLUMN "status" TYPE "article_drafts_status_enum"
          USING "status"::"article_drafts_status_enum"
    `);
  }
}
