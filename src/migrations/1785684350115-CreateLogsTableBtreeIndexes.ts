import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates B-tree indexes for equality + range filtering and deterministic
 * cursor pagination on the logs table.
 *
 * Separated from GIN indexes because:
 *  - B-tree indexes serve structured equality/range queries (service, level,
 *    timestamp, id) — standard relational filtering.
 *  - GIN indexes serve unstructured search (JSONB containment, trigrams).
 *  - Each index type has a different write-amplification cost profile and
 *    may need to be tuned or dropped independently.
 *
 * Index order rationale (equality first, range/sort last):
 *   service → timestamp DESC → id DESC
 *   level   → timestamp DESC → id DESC
 */
export class CreateLogsTableBtreeIndexes1785684350115 implements MigrationInterface {
  name = 'CreateLogsTableBtreeIndexes1785684350115';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supports: WHERE service = $1 [AND timestamp BETWEEN $2 AND $3]
    //           ORDER BY timestamp DESC, id DESC
    await queryRunner.query(`
      CREATE INDEX "idx_logs_service_timestamp_id"
        ON "logs" ("service", "timestamp" DESC, "id" DESC)
    `);

    // Supports: WHERE level = $1 [AND timestamp BETWEEN $2 AND $3]
    //           ORDER BY timestamp DESC, id DESC
    await queryRunner.query(`
      CREATE INDEX "idx_logs_level_timestamp_id"
        ON "logs" ("level", "timestamp" DESC, "id" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_logs_level_timestamp_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_logs_service_timestamp_id"`);
  }
}
