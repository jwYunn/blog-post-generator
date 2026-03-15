import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTopicCandidatesTable1773532800000 implements MigrationInterface {
  name = 'CreateTopicCandidatesTable1773532800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."topic_candidates_status_enum" AS ENUM (
        'pending',
        'approved',
        'rejected'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "topic_candidates" (
        "id"          UUID                                       NOT NULL DEFAULT gen_random_uuid(),
        "topicSeedId" UUID                                       NOT NULL,
        "keyword"     CHARACTER VARYING(200)                    NOT NULL,
        "title"       CHARACTER VARYING(300)                    NOT NULL,
        "score"       INTEGER                                   NOT NULL DEFAULT 0,
        "status"      "public"."topic_candidates_status_enum"   NOT NULL DEFAULT 'pending',
        "createdAt"   TIMESTAMP                                 NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP                                 NOT NULL DEFAULT now(),
        CONSTRAINT "PK_topic_candidates_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_topic_candidates_topicSeedId"
          FOREIGN KEY ("topicSeedId")
          REFERENCES "topic_seeds"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_topic_candidates_topicSeedId"
      ON "topic_candidates" ("topicSeedId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_topic_candidates_topicSeedId"`);
    await queryRunner.query(`DROP TABLE "topic_candidates"`);
    await queryRunner.query(`DROP TYPE "public"."topic_candidates_status_enum"`);
  }
}
