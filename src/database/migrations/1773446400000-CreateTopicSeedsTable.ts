import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTopicSeedsTable1773446400000 implements MigrationInterface {
  name = 'CreateTopicSeedsTable1773446400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."topic_seeds_category_enum" AS ENUM (
        'meaning',
        'difference',
        'example',
        'phrases',
        'grammar'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "topic_seeds" (
        "id"             UUID                                    NOT NULL DEFAULT gen_random_uuid(),
        "seed"           CHARACTER VARYING(100)                  NOT NULL,
        "normalizedSeed" CHARACTER VARYING(100)                  NOT NULL,
        "category"       "public"."topic_seeds_category_enum"    NOT NULL,
        "priority"       INTEGER                                 NOT NULL DEFAULT 5,
        "isActive"       BOOLEAN                                 NOT NULL DEFAULT true,
        "memo"           TEXT,
        "usedCount"      INTEGER                                 NOT NULL DEFAULT 0,
        "lastUsedAt"     TIMESTAMP,
        "createdAt"      TIMESTAMP                               NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP                               NOT NULL DEFAULT now(),
        "deletedAt"      TIMESTAMP,
        CONSTRAINT "PK_topic_seeds_id"             PRIMARY KEY ("id"),
        CONSTRAINT "UQ_topic_seeds_normalizedSeed"  UNIQUE ("normalizedSeed")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "topic_seeds"`);
    await queryRunner.query(`DROP TYPE "public"."topic_seeds_category_enum"`);
  }
}
