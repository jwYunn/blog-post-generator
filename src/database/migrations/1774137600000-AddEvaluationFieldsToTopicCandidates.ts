import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvaluationFieldsToTopicCandidates1774137600000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topic_candidates"
        ADD COLUMN IF NOT EXISTS "overallScore" integer,
        ADD COLUMN IF NOT EXISTS "rank"         integer,
        ADD COLUMN IF NOT EXISTS "strengths"    jsonb,
        ADD COLUMN IF NOT EXISTS "weaknesses"   jsonb,
        ADD COLUMN IF NOT EXISTS "verdict"      text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topic_candidates"
        DROP COLUMN IF EXISTS "overallScore",
        DROP COLUMN IF EXISTS "rank",
        DROP COLUMN IF EXISTS "strengths",
        DROP COLUMN IF EXISTS "weaknesses",
        DROP COLUMN IF EXISTS "verdict"
    `);
  }
}
