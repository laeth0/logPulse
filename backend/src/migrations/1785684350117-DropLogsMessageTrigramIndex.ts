import { MigrationInterface, QueryRunner } from 'typeorm';

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
