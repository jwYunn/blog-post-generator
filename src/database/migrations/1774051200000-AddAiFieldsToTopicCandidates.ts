import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAiFieldsToTopicCandidates1774051200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('topic_candidates', [
      new TableColumn({
        name: 'searchIntent',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'targetReader',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({
        name: 'whyThisTopic',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'outlinePreview',
        type: 'jsonb',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('topic_candidates', 'outlinePreview');
    await queryRunner.dropColumn('topic_candidates', 'whyThisTopic');
    await queryRunner.dropColumn('topic_candidates', 'targetReader');
    await queryRunner.dropColumn('topic_candidates', 'searchIntent');
  }
}
