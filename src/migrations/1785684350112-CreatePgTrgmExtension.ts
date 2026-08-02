import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Installs the pg_trgm extension required for trigram-based
 * case-insensitive substring search on the message column.
 *
 * Separated from schema migrations because extensions are
 * infrastructure-level and require superuser/rds_superuser privileges.
 */
export class CreatePgTrgmExtension1785684350112 implements MigrationInterface {
  name = 'CreatePgTrgmExtension1785684350112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Extensions are shared across the database — only drop if you are
    // certain no other table uses pg_trgm operators or indexes.
    await queryRunner.query(`
      DROP EXTENSION IF EXISTS pg_trgm
    `);
  }
}
