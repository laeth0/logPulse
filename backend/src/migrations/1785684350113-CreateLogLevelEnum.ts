import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLogLevelEnum1785684350113 implements MigrationInterface {
  name = 'CreateLogLevelEnum1785684350113';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."log_level" AS ENUM ('debug', 'info', 'warn', 'error')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TYPE "public"."log_level"
    `);
  }
}
