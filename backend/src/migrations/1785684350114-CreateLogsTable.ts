import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLogsTable1785684350114 implements MigrationInterface {
  name = 'CreateLogsTable1785684350114';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "logs" (
        "id"              BIGINT GENERATED ALWAYS AS IDENTITY,
        "tenant_id"       UUID                 NOT NULL,
        "timestamp"       TIMESTAMPTZ          NOT NULL,
        "level"           "public"."log_level" NOT NULL,
        "service"         TEXT                 NOT NULL,
        "message"         TEXT                 NOT NULL,
        "attributes"      JSONB                NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "pk_logs"
          PRIMARY KEY ("timestamp", "id"),

        CONSTRAINT "chk_logs_service_non_empty"
          CHECK (char_length(service) > 0),

        CONSTRAINT "chk_logs_message_non_empty"
          CHECK (char_length(message) > 0),

        CONSTRAINT "chk_logs_attributes_object"
          CHECK (jsonb_typeof(attributes) = 'object')
      ) PARTITION BY RANGE ("timestamp")
    `);

    await queryRunner.query(`
      CREATE TABLE "logs_default"
        PARTITION OF "logs" DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "logs"`);
  }
}
