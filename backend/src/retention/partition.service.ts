import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

import {
  DAILY_PARTITION_NAME_PATTERN,
  MILLISECONDS_PER_DAY,
} from '@/common/constants/retention.constants';
import type {
  PartitionExistsRow,
  PartitionRow,
} from '@/retention/interfaces/partition.interface';

@Injectable()
export class PartitionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async ensureDailyPartitions(
    queryRunner: QueryRunner,
    startInclusive: Date,
    endExclusive: Date,
  ): Promise<number> {
    let createdPartitions = 0;

    for (
      let partitionStart = new Date(startInclusive);
      partitionStart < endExclusive;
      partitionStart = this.addUtcDays(partitionStart, 1)
    ) {
      const created = await this.ensureDailyPartition(
        queryRunner,
        partitionStart,
      );

      if (created) {
        createdPartitions += 1;
      }
    }

    return createdPartitions;
  }

  async dropExpiredDailyPartitions(
    queryRunner: QueryRunner,
    cutoff: Date,
  ): Promise<number> {
    const partitions = await this.listManagedPartitions(queryRunner);
    let droppedPartitions = 0;

    for (const partitionName of partitions) {
      const partitionEnd = this.getPartitionEnd(partitionName);

      if (partitionEnd && partitionEnd <= cutoff) {
        await queryRunner.query(`DROP TABLE "public"."${partitionName}"`);
        droppedPartitions += 1;
      }
    }

    return droppedPartitions;
  }

  startOfUtcDay(value: Date): Date {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  addUtcDays(value: Date, days: number): Date {
    return new Date(value.getTime() + days * MILLISECONDS_PER_DAY);
  }

  private async ensureDailyPartition(
    queryRunner: QueryRunner,
    partitionStart: Date,
  ): Promise<boolean> {
    const partitionName = this.getPartitionName(partitionStart);

    if (await this.partitionExists(queryRunner, partitionName)) {
      return false;
    }

    const partitionEnd = this.addUtcDays(partitionStart, 1);
    const temporaryTableName = `retention_rows_${this.getDateSuffix(partitionStart)}`;

    await queryRunner.startTransaction();

    try {
      // Serializes the brief default-row handoff with inserts into the parent.
      await queryRunner.query(`LOCK TABLE "logs" IN ACCESS EXCLUSIVE MODE`);

      if (await this.partitionExists(queryRunner, partitionName)) {
        await queryRunner.commitTransaction();
        return false;
      }

      await queryRunner.query(
        `
          CREATE TEMP TABLE "${temporaryTableName}" ON COMMIT DROP AS
          SELECT *
          FROM "logs_default"
          WHERE "timestamp" >= $1 AND "timestamp" < $2
        `,
        [partitionStart, partitionEnd],
      );

      await queryRunner.query(
        `
          DELETE FROM "logs_default"
          WHERE "timestamp" >= $1 AND "timestamp" < $2
        `,
        [partitionStart, partitionEnd],
      );

      await queryRunner.query(`
        CREATE TABLE "${partitionName}"
          PARTITION OF "logs"
          FOR VALUES FROM ('${partitionStart.toISOString()}')
          TO ('${partitionEnd.toISOString()}')
      `);

      await queryRunner.query(`
        INSERT INTO "logs" (
          "id",
          "tenant_id",
          "timestamp",
          "level",
          "service",
          "message",
          "attributes",
          "ingested_at"
        ) OVERRIDING SYSTEM VALUE
        SELECT
          "id",
          "tenant_id",
          "timestamp",
          "level",
          "service",
          "message",
          "attributes",
          "ingested_at"
        FROM "${temporaryTableName}"
      `);

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    }
  }

  private async partitionExists(
    queryRunner: QueryRunner,
    partitionName: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<PartitionExistsRow[]>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_inherits AS inheritance
          INNER JOIN pg_class AS child
            ON child.oid = inheritance.inhrelid
          INNER JOIN pg_namespace AS child_namespace
            ON child_namespace.oid = child.relnamespace
          WHERE inheritance.inhparent = 'public.logs'::regclass
            AND child_namespace.nspname = 'public'
            AND child.relname = $1
        ) AS "exists"
      `,
      [partitionName],
      queryRunner,
    );

    return rows[0]?.exists === true;
  }

  private async listManagedPartitions(
    queryRunner: QueryRunner,
  ): Promise<string[]> {
    const rows = await this.dataSource.query<PartitionRow[]>(
      `
        SELECT child.relname AS "partitionName"
        FROM pg_inherits AS inheritance
        INNER JOIN pg_class AS child
          ON child.oid = inheritance.inhrelid
        INNER JOIN pg_namespace AS child_namespace
          ON child_namespace.oid = child.relnamespace
        WHERE inheritance.inhparent = 'public.logs'::regclass
          AND child_namespace.nspname = 'public'
        ORDER BY child.relname
      `,
      [],
      queryRunner,
    );

    return rows
      .map(({ partitionName }) => partitionName)
      .filter((partitionName) =>
        DAILY_PARTITION_NAME_PATTERN.test(partitionName),
      );
  }

  private getPartitionEnd(partitionName: string): Date | undefined {
    const match = DAILY_PARTITION_NAME_PATTERN.exec(partitionName);

    if (!match) {
      return undefined;
    }

    const [, year, month, day] = match;
    const partitionStart = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

    if (this.getPartitionName(partitionStart) !== partitionName) {
      return undefined;
    }

    return this.addUtcDays(partitionStart, 1);
  }

  private getPartitionName(partitionStart: Date): string {
    return `logs_${this.getDateSuffix(partitionStart)}`;
  }

  private getDateSuffix(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');

    return `${year}_${month}_${day}`;
  }
}
