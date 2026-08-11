import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tunes autovacuum for `logs`, an insert-only table under sustained
 * high-throughput ingestion, per suggestions_to_increase_the_performance.md
 * item 6.
 *
 * `autovacuum_vacuum_insert_scale_factor` (default 0.2) and
 * `autovacuum_analyze_scale_factor` (default 0.1) are raised to 0.4 and 0.2
 * respectively, so insert-triggered autovacuum and auto-ANALYZE both fire
 * less often relative to a partition's row count. `logs` is insert-only —
 * rows are never updated, so dead-tuple bloat from vacuum is not a concern
 * here — and each daily partition is a separate, fast-growing heap; the
 * goal is fewer autovacuum/ANALYZE bursts competing with ingestion for I/O
 * during sustained load, at the cost of slightly staler planner statistics
 * between analyzes.
 *
 * Verified live before implementing, because the checklist's suggested SQL
 * does not work as written: `logs` is `PARTITION BY RANGE`, and PostgreSQL
 * rejects storage parameters on a partitioned table outright
 * (`ERROR: cannot specify storage parameters for a partitioned table`,
 * `HINT: Specify storage parameters for its leaf partitions instead.`).
 * As with the (reverted) GIN pending-list tuning, this must be applied to
 * each partition's own heap individually. This migration covers
 * `logs_default` and every daily partition that already exists at
 * migration time; `PartitionService.ensureDailyPartition()` applies the
 * same setting to every partition it creates afterward.
 */
export class TuneLogsAutovacuumForInsertOnlyLoad1785684350118 implements MigrationInterface {
  name = 'TuneLogsAutovacuumForInsertOnlyLoad1785684350118';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "logs_default" SET (
        autovacuum_vacuum_insert_scale_factor = 0.4,
        autovacuum_analyze_scale_factor = 0.2
      )
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
            'ALTER TABLE %I SET (autovacuum_vacuum_insert_scale_factor = 0.4, autovacuum_analyze_scale_factor = 0.2)',
            partition_name
          );
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "logs_default" RESET (
        autovacuum_vacuum_insert_scale_factor,
        autovacuum_analyze_scale_factor
      )
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
            'ALTER TABLE %I RESET (autovacuum_vacuum_insert_scale_factor, autovacuum_analyze_scale_factor)',
            partition_name
          );
        END LOOP;
      END $$;
    `);
  }
}
