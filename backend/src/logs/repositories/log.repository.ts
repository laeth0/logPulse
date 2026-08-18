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

  async insertMany(logs: readonly NewLog[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.insertLogsIn(manager, logs);
      await this.upsertRollups(manager, logs);
    });
  }

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

  private escapeCsvField(value: string): string {
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }
}
