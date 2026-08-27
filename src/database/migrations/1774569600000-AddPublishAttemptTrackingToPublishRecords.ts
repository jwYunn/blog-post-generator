import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublishAttemptTrackingToPublishRecords1774569600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "article_publish_records_status_enum" AS ENUM (
        'attempting',
        'published',
        'failed'
      )
    `);

    // Every existing row was written only after a publish had already
    // succeeded, so backfilling them as 'published' states what they meant.
    await queryRunner.query(`
      ALTER TABLE "article_publish_records"
        ADD COLUMN "status" "article_publish_records_status_enum"
          NOT NULL DEFAULT 'published'
    `);

    // Past the backfill the safe fallback is the opposite one: an insert that
    // omits the column should read as "needs checking", never as "all fine".
    await queryRunner.query(`
      ALTER TABLE "article_publish_records"
        ALTER COLUMN "status" SET DEFAULT 'attempting'
    `);

    // Nullable because rows written before this migration cannot say which
    // blog they went to. Everything the app writes from here on sets it.
    await queryRunner.query(`
      ALTER TABLE "article_publish_records"
        ADD COLUMN "blogName" VARCHAR(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "article_publish_records" DROP COLUMN "blogName"
    `);
    await queryRunner.query(`
      ALTER TABLE "article_publish_records" DROP COLUMN "status"
    `);
    await queryRunner.query(`DROP TYPE "article_publish_records_status_enum"`);
  }
}
