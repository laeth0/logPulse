import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the trigram GIN index on `logs.message`.
 *
 * Measured via EXPLAIN (ANALYZE, BUFFERS) and an external load benchmark
 * (see suggestions_to_increase_the_performance.md, item 1.1): gin_trgm_ops
 * writes roughly one index entry per character of `message`, and this was
 * identified as the leading cause of ~400us of database CPU per ingested
 * row — the dominant bottleneck keeping ingestion at ~2,457 logs/sec
 * against a 15,000 logs/sec target.
 *
 * `q` (ILIKE '%term%' substring search) remains required functionality and
 * keeps working without this index: daily range partitioning means a
 * since/until-scoped query prunes to a handful of partitions of ~33,000
 * rows each at the ~1M-row target scale, and a sequential ILIKE scan over
 * that range completes well within the 1-second aggregation/query budget.
 */
export class DropLogsMessageTrigramIndex1785684350117 implements MigrationInterface {
  name = 'DropLogsMessageTrigramIndex1785684350117';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_logs_message_trigram"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_logs_message_trigram"
        ON "logs" USING GIN ("message" gin_trgm_ops)
    `);
  }
}
