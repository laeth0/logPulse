import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the partitioned logs table with all column definitions,
 * check constraints, primary key, and a default partition.
 *
 * Separated from index migrations because:
 *  - Table structure and constraints define correctness (data integrity).
 *  - Indexes define performance (query optimization).
 *  - Indexes can be added/dropped without changing the schema contract.
 */
export class CreateLogsTable1785684350114 implements MigrationInterface {
  name = 'CreateLogsTable1785684350114';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Partitioned parent table ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "logs" (
        "id"              BIGINT GENERATED ALWAYS AS IDENTITY,
        "timestamp"       TIMESTAMPTZ          NOT NULL,
        "level"           "public"."log_level" NOT NULL,
        "service"         TEXT                 NOT NULL,
        "message"         TEXT                 NOT NULL,
        "attributes"      JSONB                NOT NULL DEFAULT '{}'::jsonb,
        "attributes_text" JSONB                NOT NULL DEFAULT '{}'::jsonb,
        "ingested_at"     TIMESTAMPTZ          NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "pk_logs"
          PRIMARY KEY ("timestamp", "id"),

        CONSTRAINT "chk_logs_service_non_empty"
          CHECK (char_length(service) > 0),

        CONSTRAINT "chk_logs_message_non_empty"
          CHECK (char_length(message) > 0),

        CONSTRAINT "chk_logs_attributes_object"
          CHECK (jsonb_typeof(attributes) = 'object'),

        CONSTRAINT "chk_logs_attributes_text_object"
          CHECK (jsonb_typeof(attributes_text) = 'object')
      ) PARTITION BY RANGE ("timestamp")
    `);

    // ── Default partition ─────────────────────────────────────────────────────
    // Catches rows whose timestamp falls outside any named daily partition.
    // The partition manager (RetentionService) creates and drops named partitions
    // at runtime; this default partition prevents insert failures in the interim.
    await queryRunner.query(`
      CREATE TABLE "logs_default"
        PARTITION OF "logs" DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the parent table automatically drops all child partitions,
    // including logs_default and any named daily partitions.
    await queryRunner.query(`DROP TABLE "logs"`);
  }
}
