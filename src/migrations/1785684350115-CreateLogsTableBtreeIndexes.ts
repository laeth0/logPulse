import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates B-tree indexes for equality + range filtering and deterministic
 * cursor pagination on the logs table.
 *
 * Separated from GIN indexes because:
 *  - B-tree indexes serve structured equality/range queries (tenant, service,
 *    level, timestamp, id) — standard relational filtering.
 *  - GIN indexes serve unstructured search (JSONB containment, trigrams).
 *  - Each index type has a different write-amplification cost profile and
 *    may need to be tuned or dropped independently.
 *
 * Index order rationale (equality first, range/sort last):
 *   tenant_id                → timestamp DESC → id DESC
 *   tenant_id → service      → timestamp DESC → id DESC
 *   tenant_id → level        → timestamp DESC → id DESC
 *
 * All three lead with tenant_id because every query against this table now
 * carries an unconditional `tenant_id = $1` predicate (see
 * specs/001-multi-tenancy/research.md Decision 8 and Decision 10) — the same
 * leading-equality-column pattern this file already used for service/level,
 * just with tenant_id added as the new outermost equality column.
 */
export class CreateLogsTableBtreeIndexes1785684350115 implements MigrationInterface {
  name = 'CreateLogsTableBtreeIndexes1785684350115';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supports: WHERE tenant_id = $1 [AND timestamp BETWEEN $2 AND $3]
    //           ORDER BY timestamp DESC, id DESC
    // (the no-service/no-level filter case, e.g. plain GET /logs?since=...)
    await queryRunner.query(`
      CREATE INDEX "idx_logs_tenant_timestamp_id"
        ON "logs" ("tenant_id", "timestamp" DESC, "id" DESC)
    `);

    // Supports: WHERE tenant_id = $1 AND service = $2 [AND timestamp BETWEEN $3 AND $4]
    //           ORDER BY timestamp DESC, id DESC
    await queryRunner.query(`
      CREATE INDEX "idx_logs_tenant_service_timestamp_id"
        ON "logs" ("tenant_id", "service", "timestamp" DESC, "id" DESC)
    `);

    // Supports: WHERE tenant_id = $1 AND level = $2 [AND timestamp BETWEEN $3 AND $4]
    //           ORDER BY timestamp DESC, id DESC
    await queryRunner.query(`
      CREATE INDEX "idx_logs_tenant_level_timestamp_id"
        ON "logs" ("tenant_id", "level", "timestamp" DESC, "id" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_logs_tenant_level_timestamp_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_logs_tenant_service_timestamp_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_logs_tenant_timestamp_id"`,
    );
  }
}
