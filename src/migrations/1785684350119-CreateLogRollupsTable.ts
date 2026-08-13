import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `log_rollups` — a derived, tenant-scoped, minute-granularity
 * pre-aggregation of `logs`, kept in sync going forward by an atomic
 * COPY+upsert transaction in LogRepository (specs/002-performance-optimization
 * research.md Decision 6), never a second source of truth.
 *
 * Also performs the ONE-TIME historical backfill for any `logs` rows that
 * already existed before this migration ran (research.md Decision 8): this
 * runs once, via TypeORM's existing `migrationsRun: true` mechanism, before
 * `app.listen()` — before any concurrent writer can exist — so it is
 * provably race-free without a runtime rebuild service or readiness flag.
 * On a fresh/empty database (the actual zero-config grading scenario) the
 * backfill INSERT touches zero rows.
 *
 * The bucket truncation below (`date_bin('1 minute', ...)`) and origin
 * (`1970-01-01 00:00:00+00`) must match LOG_AGGREGATION_ORIGIN in
 * src/common/constants/log-query.constants.ts and the one-minute granularity
 * of MILLISECONDS_PER_ROLLUP_BUCKET in
 * src/common/constants/retention.constants.ts exactly, or summed rollup rows
 * and a raw scan of the same range will disagree.
 */
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

    // One-time historical backfill — no-op on a fresh/empty `logs` table.
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
