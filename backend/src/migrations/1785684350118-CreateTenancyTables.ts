import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenancyTables1785684350118 implements MigrationInterface {
  name = 'CreateTenancyTables1785684350118';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "email"         TEXT NOT NULL,
        "password_hash" TEXT NOT NULL,

        CONSTRAINT "pk_tenants"
          PRIMARY KEY ("id"),

        CONSTRAINT "uq_tenants_email"
          UNIQUE ("email"),

        CONSTRAINT "chk_tenants_email_non_empty"
          CHECK (char_length(email) > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"  UUID        NOT NULL,
        "key_value"  TEXT        NOT NULL,
        "status"     TEXT        NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "revoked_at" TIMESTAMPTZ,

        CONSTRAINT "pk_api_keys"
          PRIMARY KEY ("id"),

        CONSTRAINT "uq_api_keys_key_value"
          UNIQUE ("key_value"),

        CONSTRAINT "chk_api_keys_status_valid"
          CHECK (status IN ('active', 'revoked'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_api_keys_tenant_id"
        ON "api_keys" ("tenant_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_refresh_tokens" (
        "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"  UUID        NOT NULL,
        "token_hash" TEXT        NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "revoked_at" TIMESTAMPTZ,

        CONSTRAINT "pk_tenant_refresh_tokens"
          PRIMARY KEY ("id"),

        CONSTRAINT "uq_tenant_refresh_tokens_token_hash"
          UNIQUE ("token_hash")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_tenant_refresh_tokens_tenant_id"
        ON "tenant_refresh_tokens" ("tenant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}
