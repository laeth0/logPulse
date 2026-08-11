import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tunes `gin_pending_list_limit` on the `attributes_text` GIN index, per
 * suggestions_to_increase_the_performance.md item 5.
 *
 * Two things verified live against the running PostgreSQL 16 container
 * before writing this migration, because the checklist's suggested
 * one-liner does not work as written:
 *
 *  - `gin_pending_list_limit` is an integer number of KB, not a size
 *    string — `SET (gin_pending_list_limit = '8MB')` fails with
 *    "invalid value for integer option"; the correct value is 8192.
 *  - `idx_logs_attributes_text_gin` is a *partitioned* index (`logs` is
 *    `PARTITION BY RANGE`), and PostgreSQL rejects
 *    `ALTER INDEX ... SET (...)` on a partitioned index outright
 *    ("This operation is not supported for partitioned indexes").
 *    Storage parameters must be set on each partition's physical index.
 *
 * This migration covers `logs_default` (present since the initial
 * migration) and every daily partition that already exists at migration
 * time. `PartitionService.ensureDailyPartition()` applies the same
 * setting to every partition it creates afterward, so partitions created
 * in the future stay covered without another migration.
 */
export class TuneAttributesTextGinPendingList1785684350118 implements MigrationInterface {
  name = 'TuneAttributesTextGinPendingList1785684350118';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER INDEX "logs_default_attributes_text_idx"
      SET (gin_pending_list_limit = 8192)
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        partition_name text;
      BEGIN
        FOR partition_name IN
          SELECT child.relname
          FROM pg_inherits inh
          JOIN pg_class child ON child.oid = inh.inhrelid
          JOIN pg_namespace ns ON ns.oid = child.relnamespace
          WHERE inh.inhparent = 'public.logs'::regclass
            AND ns.nspname = 'public'
            AND child.relname ~ '^logs_\\d{4}_\\d{2}_\\d{2}$'
        LOOP
          EXECUTE format(
            'ALTER INDEX %I SET (gin_pending_list_limit = 8192)',
            partition_name || '_attributes_text_idx'
          );
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER INDEX "logs_default_attributes_text_idx"
      RESET (gin_pending_list_limit)
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        partition_name text;
      BEGIN
        FOR partition_name IN
          SELECT child.relname
          FROM pg_inherits inh
          JOIN pg_class child ON child.oid = inh.inhrelid
          JOIN pg_namespace ns ON ns.oid = child.relnamespace
          WHERE inh.inhparent = 'public.logs'::regclass
            AND ns.nspname = 'public'
            AND child.relname ~ '^logs_\\d{4}_\\d{2}_\\d{2}$'
        LOOP
          EXECUTE format(
            'ALTER INDEX %I RESET (gin_pending_list_limit)',
            partition_name || '_attributes_text_idx'
          );
        END LOOP;
      END $$;
    `);
  }
}
