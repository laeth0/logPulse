import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan, QueryRunner } from 'typeorm';

import {
  DEFAULT_LOG_PARTITION_DAYS_AHEAD,
  DEFAULT_LOG_RETENTION_DAYS,
  LOG_RETENTION_LOCK_ID,
  LOG_RETENTION_LOCK_NAMESPACE,
  MILLISECONDS_PER_DAY,
} from '@/common/constants/retention.constants';
import { Log } from '@/logs/entities/log.entity';
import type { AdvisoryLockRow } from '@/retention/interfaces/retention.interface';
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

      const droppedPartitions =
        await this.partitionService.dropExpiredDailyPartitions(
          queryRunner,
          cutoff,
        );

      const deletedRows = await this.deleteExpiredRows(queryRunner, cutoff);

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
          `dropped ${droppedPartitions} partition(s), deleted ${deletedRows} expired row(s)`,
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

  private async deleteExpiredRows(
    queryRunner: QueryRunner,
    cutoff: Date,
  ): Promise<number> {
    const result = await queryRunner.manager.getRepository(Log).delete({
      timestamp: LessThan(cutoff),
    });

    return result.affected ?? 0;
  }
}
