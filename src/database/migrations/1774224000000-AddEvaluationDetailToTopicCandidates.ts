import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvaluationDetailToTopicCandidates1774224000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topic_candidates"
        ADD COLUMN IF NOT EXISTS "evaluationDetail" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "topic_candidates"
        ALTER COLUMN "verdict" TYPE varchar(10)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topic_candidates"
        DROP COLUMN IF EXISTS "evaluationDetail"
    `);
  }
}
