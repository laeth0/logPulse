import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLogsTableGinIndexes1785684350116 implements MigrationInterface {
  name = 'CreateLogsTableGinIndexes1785684350116';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_logs_message_trigram"
        ON "logs" USING GIN ("message" gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_logs_message_trigram"`);
  }
}
