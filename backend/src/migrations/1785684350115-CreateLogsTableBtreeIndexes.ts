import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLogsTableBtreeIndexes1785684350115 implements MigrationInterface {
  name = 'CreateLogsTableBtreeIndexes1785684350115';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_logs_tenant_timestamp_id"
        ON "logs" ("tenant_id", "timestamp" DESC, "id" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_logs_tenant_service_timestamp_id"
        ON "logs" ("tenant_id", "service", "timestamp" DESC, "id" DESC)
    `);

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
