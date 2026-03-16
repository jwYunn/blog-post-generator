import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHashtagsToArticleDrafts1773705600000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "article_drafts"
      ADD COLUMN "hashtags" JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "article_drafts"
      DROP COLUMN "hashtags"
    `);
  }
}
