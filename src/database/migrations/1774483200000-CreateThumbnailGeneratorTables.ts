import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateThumbnailGeneratorTables1774483200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // thumbnail_prompts
    await queryRunner.query(`
      CREATE TYPE "thumbnail_prompt_status_enum" AS ENUM ('generating', 'done', 'failed');
    `);

    await queryRunner.query(`
      CREATE TABLE "thumbnail_prompts" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name"        varchar(100),
        "prompt"      text NOT NULL,
        "model"       varchar(100) NOT NULL DEFAULT 'black-forest-labs/flux-schnell',
        "meta"        jsonb,
        "status"      "thumbnail_prompt_status_enum" NOT NULL DEFAULT 'generating',
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_thumbnail_prompts" PRIMARY KEY ("id")
      )
    `);

    // thumbnails
    await queryRunner.query(`
      CREATE TABLE "thumbnails" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "url"         text NOT NULL,
        "mimeType"    varchar(50),
        "width"       integer,
        "height"      integer,
        "meta"        jsonb,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_thumbnails" PRIMARY KEY ("id")
      )
    `);

    // thumbnail_prompt_mappings
    await queryRunner.query(`
      CREATE TABLE "thumbnail_prompt_mappings" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "promptId"    uuid NOT NULL,
        "thumbnailId" uuid NOT NULL,
        "rank"        integer,
        "active"      boolean NOT NULL DEFAULT false,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_thumbnail_prompt_mappings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_thumbnail_prompt_mappings_prompt"
          FOREIGN KEY ("promptId") REFERENCES "thumbnail_prompts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_thumbnail_prompt_mappings_thumbnail"
          FOREIGN KEY ("thumbnailId") REFERENCES "thumbnails"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "thumbnail_prompt_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "thumbnails"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "thumbnail_prompts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "thumbnail_prompt_status_enum"`);
  }
}
