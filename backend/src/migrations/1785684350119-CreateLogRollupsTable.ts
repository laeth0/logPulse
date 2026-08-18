import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLogRollupsTable1785684350119 implements MigrationInterface {
  name = 'CreateLogRollupsTable1785684350119';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "log_rollups" (
        "bucket"    TIMESTAMPTZ          NOT NULL,
        "tenant_id" UUID                 NOT NULL,
        "service"   TEXT                 NOT NULL,
        "level"     "public"."log_level" NOT NULL,
        "count"     BIGINT               NOT NULL DEFAULT 0,

        CONSTRAINT "pk_log_rollups"
          PRIMARY KEY ("bucket", "tenant_id", "service", "level")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "log_rollups" ("bucket", "tenant_id", "service", "level", "count")
      SELECT
        date_bin('1 minute', "timestamp", TIMESTAMPTZ '1970-01-01 00:00:00+00') AS "bucket",
        "tenant_id",
        "service",
        "level",
        COUNT(*) AS "count"
      FROM "logs"
      GROUP BY 1, 2, 3, 4
      ON CONFLICT ("bucket", "tenant_id", "service", "level")
      DO UPDATE SET "count" = "log_rollups"."count" + EXCLUDED."count"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "log_rollups"`);
  }
}
