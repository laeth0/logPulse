import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Client } from 'pg';
import { from as copyFromStdin } from 'pg-copy-streams';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import {
  alignDownToRollupBucket,
  alignUpToRollupBucket,
} from '@/common/utils/rollup-bucket.utils';
import { LogRollup } from '@/logs/entities/log-rollup.entity';
import { Log } from '@/logs/entities/log.entity';
import type {
  AggregateLogsQuery,
  FindLogsQuery,
} from '@/logs/interfaces/log-query.interface';
import type { NewLog } from '@/logs/interfaces/log-ingest.interface';
import type {
  LogAggregation,
  LogPage,
  RawLogAggregation,
  RawLogRow,
} from '@/logs/interfaces/log-result.interface';
import type { LogRepositoryContract } from '@/logs/interfaces/log-repository.interface';
import type { RollupDelta } from '@/logs/interfaces/log-rollup.interface';
import {
  buildAggregationQuery,
  buildRollupAggregationQuery,
  isRollupEligible,
} from '@/logs/query-builders/aggregation-query.builder';
import { buildLogPageQuery } from '@/logs/query-builders/log-query.builder';

@Injectable()
export class LogRepository implements LogRepositoryContract {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
    @InjectRepository(LogRollup)
    private readonly logRollupRepository: Repository<LogRollup>,
  ) {}

  /**
   * Bulk-inserts a batch of logs using PostgreSQL COPY streaming within a transaction,
   * and updates corresponding pre-aggregated rollup counts.
   *
   * @param logs - Array of new log records to insert.
   */
  async insertMany(logs: readonly NewLog[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.insertLogsIn(manager, logs);
      await this.upsertRollups(manager, logs);
    });
  }

  /**
   * Aggregates ingested logs into 5-minute bucket rollup counts and upserts them into `log_rollups`.
   *
   * @param manager - Transactional EntityManager.
   * @param logs - The ingested logs in the current transaction.
   */
  private async upsertRollups(
    manager: EntityManager,
    logs: readonly NewLog[],
  ): Promise<void> {
    const deltas = this.groupIntoRollupDeltas(logs);
    const values: unknown[] = [];
    const placeholderRows = deltas.map((delta, index) => {
      const paramOffset = index * 5;
      values.push(
        delta.bucket,
        delta.tenant_id,
        delta.service,
        delta.level,
        delta.count,
      );
      return `($${paramOffset + 1}, $${paramOffset + 2}, $${paramOffset + 3}, $${paramOffset + 4}, $${paramOffset + 5})`;
    });

    await manager.query(
      `
        INSERT INTO log_rollups (bucket, tenant_id, service, level, count)
        VALUES ${placeholderRows.join(', ')}
        ON CONFLICT (bucket, tenant_id, service, level)
        DO UPDATE SET count = log_rollups.count + EXCLUDED.count
      `,
      values,
    );
  }

  /**
   * Groups a list of logs by (bucket, tenant_id, service, level) tuples to calculate rollup deltas.
   *
   * @param logs - The raw logs to group.
   * @returns Array of RollupDelta objects with aggregated counts.
   */
  private groupIntoRollupDeltas(logs: readonly NewLog[]): RollupDelta[] {
    const groups = new Map<string, RollupDelta>();

    for (const log of logs) {
      const bucket = alignDownToRollupBucket(log.timestamp);
      const key = `${bucket.getTime()}|${log.tenant_id}|${log.service}|${log.level}`;
      const existing = groups.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        groups.set(key, {
          bucket,
          tenant_id: log.tenant_id,
          service: log.service,
          level: log.level,
          count: 1,
        });
      }
    }

    return [...groups.values()];
  }

  /**
   * Fetches a paginated page of logs based on filters, limit, and keyset cursor.
   *
   * @param query - The pagination and filter parameters.
   * @returns A LogPage containing the matched logs and a `hasMore` indicator.
   */
  async findPage(query: FindLogsQuery): Promise<LogPage> {
    const logs = await buildLogPageQuery(
      this.logRepository,
      query,
    ).getRawMany<RawLogRow>();
    const hasMore = logs.length > query.limit;

    return {
      logs: hasMore ? logs.slice(0, query.limit) : logs,
      hasMore,
    };
  }

  /**
   * Aggregates log counts into time buckets.
   * Uses pre-aggregated rollups for aligned time ranges when eligible,
   * falling back to raw table scans for unaligned edges and non-rollup-eligible queries.
   *
   * @param query - The aggregation query parameters.
   * @returns An array of LogAggregation bucket results sorted chronologically.
   */
  async aggregate(query: AggregateLogsQuery): Promise<LogAggregation[]> {
    if (!isRollupEligible(query)) {
      return this.mergeAggregationRows(
        await this.aggregateRawScan(query, query.since, query.until),
      );
    }

    const rollupSince = alignUpToRollupBucket(query.since);
    const rollupUntil = alignDownToRollupBucket(query.until);
    const aggregationRows: RawLogAggregation[] = [];

    if (rollupSince < rollupUntil) {
      const rollupAggregationRows = await buildRollupAggregationQuery(
        this.logRollupRepository,
        query,
        rollupSince,
        rollupUntil,
      ).getRawMany<RawLogAggregation>();
      aggregationRows.push(...rollupAggregationRows);
    }

    if (query.since < rollupSince) {
      aggregationRows.push(
        ...(await this.aggregateRawScan(query, query.since, rollupSince)),
      );
    }

    if (rollupUntil < query.until) {
      aggregationRows.push(
        ...(await this.aggregateRawScan(query, rollupUntil, query.until)),
      );
    }

    return this.mergeAggregationRows(aggregationRows);
  }

  /**
   * Performs a direct query against the `logs` table for a specified time slice.
   *
   * @param query - Base aggregation parameters.
   * @param since - Slice start time.
   * @param until - Slice end time.
   * @returns Raw aggregation rows from the database.
   */
  private async aggregateRawScan(
    query: AggregateLogsQuery,
    since: Date,
    until: Date,
  ): Promise<RawLogAggregation[]> {
    return buildAggregationQuery(this.logRepository, {
      ...query,
      since,
      until,
    }).getRawMany<RawLogAggregation>();
  }

  /**
   * Merges multiple sets of raw aggregation rows (e.g. from rollup table + edge scans)
   * into unique, combined bucket results.
   *
   * @param rows - Raw aggregation rows.
   * @returns Sorted and combined LogAggregation array.
   */
  private mergeAggregationRows(rows: RawLogAggregation[]): LogAggregation[] {
    const merged = new Map<string, LogAggregation>();

    for (const row of rows) {
      const key = `${row.start.getTime()}|${row.group ?? ''}`;
      const count = Number(row.count);
      const existing = merged.get(key);

      if (existing) {
        existing.count += count;
      } else {
        merged.set(key, { start: row.start, group: row.group, count });
      }
    }

    return [...merged.values()].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
  }

  /**
   * Executes high-throughput PostgreSQL `COPY FROM STDIN` streaming to bulk insert logs.
   *
   * @param manager - Transactional EntityManager.
   * @param logs - Array of new log records.
   */
  private async insertLogsIn(
    manager: EntityManager,
    logs: readonly NewLog[],
  ): Promise<void> {
    const queryRunner = manager.queryRunner;

    if (!queryRunner) {
      throw new Error(
        'insertLogsIn requires a transactional EntityManager with an active QueryRunner',
      );
    }

    const client = (await queryRunner.connect()) as Client;
    const copyStream = client.query(
      copyFromStdin(
        'COPY logs (timestamp, tenant_id, level, service, message, attributes) FROM STDIN WITH (FORMAT csv)',
      ),
    );

    await pipeline(Readable.from([this.buildLogsCsv(logs)]), copyStream);
  }

  /**
   * Serializes an array of log records into CSV format matching the COPY column layout.
   *
   * @param logs - Array of new log records.
   * @returns Formatted CSV string.
   */
  private buildLogsCsv(logs: readonly NewLog[]): string {
    const csvRows = logs.map((log) =>
      [
        log.timestamp.toISOString(),
        log.tenant_id,
        log.level,
        log.service,
        log.message,
        JSON.stringify(log.attributes),
      ]
        .map((field) => this.escapeCsvField(field))
        .join(','),
    );

    return csvRows.join('\n') + '\n';
  }

  /**
   * Escapes quotes and special characters in CSV fields per RFC 4180.
   *
   * @param value - Raw field value.
   * @returns Escaped CSV field string.
   */
  private escapeCsvField(value: string): string {
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }
}
