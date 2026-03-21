import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterOverallScoreToDecimal1774310400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topic_candidates"
        ALTER COLUMN "overallScore" TYPE decimal(5, 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topic_candidates"
        ALTER COLUMN "overallScore" TYPE integer USING ROUND("overallScore")
    `);
  }
}
