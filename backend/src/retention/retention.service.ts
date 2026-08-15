import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan, QueryRunner } from 'typeorm';

import {
  DEFAULT_LOG_PARTITION_DAYS_AHEAD,
  DEFAULT_LOG_RETENTION_DAYS,
  LOG_RETENTION_LOCK_ID,
  LOG_RETENTION_LOCK_NAMESPACE,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_ROLLUP_BUCKET,
} from '@/common/constants/retention.constants';
import { alignDownToRollupBucket } from '@/common/utils/rollup-bucket.utils';
import { Log } from '@/logs/entities/log.entity';
import type {
  AdvisoryLockRow,
  BoundaryBucketDeleteRow,
} from '@/retention/interfaces/retention.interface';
import { PartitionService } from '@/retention/partition.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  private readonly retentionDays = process.env.LOG_RETENTION_DAYS
    ? Number(process.env.LOG_RETENTION_DAYS)
    : DEFAULT_LOG_RETENTION_DAYS;

  private readonly partitionDaysAhead = process.env.LOG_PARTITION_DAYS_AHEAD
    ? Number(process.env.LOG_PARTITION_DAYS_AHEAD)
    : DEFAULT_LOG_PARTITION_DAYS_AHEAD;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly partitionService: PartitionService,
  ) {}

  async runMaintenance(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    let lockAcquired = false;

    try {
      lockAcquired = await this.acquireMaintenanceLock(queryRunner);

      if (!lockAcquired) {
        this.logger.debug(
          'Retention maintenance is already running in another instance',
        );
        return;
      }

      const now = new Date();
      const cutoff = new Date(
        now.getTime() - this.retentionDays * MILLISECONDS_PER_DAY,
      );
      // Rows strictly before this bucket are covered by the bulk log_rollups
      // delete below; the one bucket straddling `cutoff` gets a precise
      // delta adjustment instead (research.md Decision 9).
      const cutoffBucket = alignDownToRollupBucket(cutoff);

      const droppedPartitions =
        await this.partitionService.dropExpiredDailyPartitions(
          queryRunner,
          cutoff,
        );

      const deletedRows = await this.deleteExpiredRows(
        queryRunner,
        cutoffBucket,
      );
      const boundaryDeletedRows = await this.pruneBoundaryRollupBucket(
        queryRunner,
        cutoffBucket,
        cutoff,
      );
      await this.pruneExpiredRollupBuckets(queryRunner, cutoffBucket);

      const firstPartitionDay = this.partitionService.startOfUtcDay(cutoff);
      const lastRequiredDay = this.partitionService.addUtcDays(
        this.partitionService.startOfUtcDay(now),
        this.partitionDaysAhead + 1,
      );
      const createdPartitions =
        await this.partitionService.ensureDailyPartitions(
          queryRunner,
          firstPartitionDay,
          lastRequiredDay,
        );

      this.logger.log(
        `Retention maintenance completed: created ${createdPartitions} partition(s), ` +
          `dropped ${droppedPartitions} partition(s), deleted ${deletedRows + boundaryDeletedRows} expired row(s)`,
      );
    } finally {
      try {
        if (lockAcquired) {
          await this.releaseMaintenanceLock(queryRunner);
        }
      } finally {
        await queryRunner.release();
      }
    }
  }

  private async acquireMaintenanceLock(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<AdvisoryLockRow[]>(
      `SELECT pg_try_advisory_lock($1, $2) AS "acquired"`,
      [LOG_RETENTION_LOCK_NAMESPACE, LOG_RETENTION_LOCK_ID],
      queryRunner,
    );

    return rows[0]?.acquired === true;
  }

  private async releaseMaintenanceLock(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`SELECT pg_advisory_unlock($1, $2)`, [
      LOG_RETENTION_LOCK_NAMESPACE,
      LOG_RETENTION_LOCK_ID,
    ]);
  }

  /**
   * Bulk-deletes rows strictly before `cutoffBucket` — every log_rollups
   * row for a bucket in this range is wiped wholesale by
   * pruneExpiredRollupBuckets() below, so no per-row delta is needed here.
   * The one bucket straddling the real retention `cutoff` is handled
   * separately by pruneBoundaryRollupBucket() (research.md Decision 9).
   */
  private async deleteExpiredRows(
    queryRunner: QueryRunner,
    cutoffBucket: Date,
  ): Promise<number> {
    const result = await queryRunner.manager.getRepository(Log).delete({
      timestamp: LessThan(cutoffBucket),
    });

    return result.affected ?? 0;
  }

  /**
   * Deletes the boundary bucket's straggler `logs` rows — those in
   * `[cutoffBucket, cutoff)`, the partial bucket deleteExpiredRows() above
   * intentionally left untouched — and decrements `log_rollups` by exactly
   * the number of rows this same statement deletes, computed as a single
   * atomic CTE rather than a separate `SELECT COUNT(*)` followed by a
   * replace. A relative delta commutes correctly with a concurrent live
   * upsert regardless of commit order; a snapshot-and-replace would not
   * (research.md Decision 9, "M2" fix).
   */
  private async pruneBoundaryRollupBucket(
    queryRunner: QueryRunner,
    cutoffBucket: Date,
    cutoff: Date,
  ): Promise<number> {
    const bucketEnd = new Date(
      cutoffBucket.getTime() + MILLISECONDS_PER_ROLLUP_BUCKET,
    );

    const rows = await this.dataSource.query<BoundaryBucketDeleteRow[]>(
      `
        WITH deleted AS (
          DELETE FROM logs
          WHERE timestamp >= $1 AND timestamp < $2 AND timestamp < $3
          RETURNING tenant_id, service, level
        ),
        deltas AS (
          SELECT tenant_id, service, level, COUNT(*) AS removed
          FROM deleted
          GROUP BY 1, 2, 3
        ),
        rollup_update AS (
          UPDATE log_rollups
          SET count = log_rollups.count - deltas.removed
          FROM deltas
          WHERE log_rollups.bucket = $1
            AND log_rollups.tenant_id = deltas.tenant_id
            AND log_rollups.service = deltas.service
            AND log_rollups.level = deltas.level
        )
        SELECT COUNT(*) AS "deletedCount" FROM deleted
      `,
      [cutoffBucket, bucketEnd, cutoff],
      queryRunner,
    );

    return Number(rows[0]?.deletedCount ?? 0);
  }

  /** Fully-expired buckets are unconditionally, wholesale bulk-deleted (research.md Decision 9). */
  private async pruneExpiredRollupBuckets(
    queryRunner: QueryRunner,
    cutoffBucket: Date,
  ): Promise<void> {
    await queryRunner.query(`DELETE FROM log_rollups WHERE bucket < $1`, [
      cutoffBucket,
    ]);
  }
}
