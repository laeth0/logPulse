import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the log_level PostgreSQL enum type.
 *
 * Separated from table creation because enum types are database-level
 * type definitions that may be reused, and their lifecycle (creation,
 * renaming, dropping) is independent of any specific table.
 */
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
