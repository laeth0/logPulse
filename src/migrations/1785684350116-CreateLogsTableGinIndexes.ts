import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates GIN indexes for unstructured search on the logs table.
 *
 * Separated from B-tree indexes because GIN indexes have distinct
 * characteristics that may require independent tuning decisions:
 *  - Higher write amplification (inserts are more expensive).
 *  - Can be large (especially the trigram index on message).
 *  - May need to be disabled during bulk ingestion and rebuilt afterwards.
 *  - Require the pg_trgm extension (CreatePgTrgmExtension migration).
 *
 * Index details:
 *  - jsonb_path_ops: smaller and faster than the default JSONB operator
 *    class for @> containment queries; sufficient because the API only
 *    needs attribute equality, not complex JSON path queries.
 *  - gin_trgm_ops: breaks message text into trigrams enabling efficient
 *    ILIKE '%term%' substring search.
 */
export class CreateLogsTableGinIndexes1785684350116 implements MigrationInterface {
  name = 'CreateLogsTableGinIndexes1785684350116';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supports: WHERE attributes_text @> jsonb_build_object($key, $value)
    await queryRunner.query(`
      CREATE INDEX "idx_logs_attributes_text_gin"
        ON "logs" USING GIN ("attributes_text" jsonb_path_ops)
    `);

    // Supports: WHERE message ILIKE '%term%'
    await queryRunner.query(`
      CREATE INDEX "idx_logs_message_trigram"
        ON "logs" USING GIN ("message" gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_logs_message_trigram"`);
    await queryRunner.query(`DROP INDEX "public"."idx_logs_attributes_text_gin"`);
  }
}
