import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlogCssTable1773792000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "blog_css" (
        "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
        "blogUrl"   VARCHAR(500) NOT NULL,
        "css"       TEXT         NOT NULL,
        "meta"      JSONB,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blog_css"     PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_css_url" UNIQUE ("blogUrl")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "blog_css"`);
  }
}
