import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePgTrgmExtension1785684350112 implements MigrationInterface {
  name = 'CreatePgTrgmExtension1785684350112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP EXTENSION IF EXISTS pg_trgm
    `);
  }
}
