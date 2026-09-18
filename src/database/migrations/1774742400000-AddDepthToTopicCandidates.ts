import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepthToTopicCandidates1774742400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable with no default: the candidates already in the table were never
    // given a depth, and null is how that is told apart from a decided one
    await queryRunner.query(`
      ALTER TABLE topic_candidates ADD COLUMN depth VARCHAR(10)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE topic_candidates DROP COLUMN depth`);
  }
}
