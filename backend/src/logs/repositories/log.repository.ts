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
  LogAggregation,
  LogPage,
  RawLogAggregation,
  RawLogRow,
} from '@/logs/interfaces/log-query.interface';
import type {
  LogRepositoryContract,
  NewLog,
} from '@/logs/interfaces/log-repository.interface';
import {
  buildAggregationQuery,
  buildRollupAggregationQuery,
  isRollupEligible,
} from '@/logs/query-builders/aggregation-query.builder';
import { buildLogPageQuery } from '@/logs/query-builders/log-query.builder';

/** One (bucket, tenant_id, service, level) group's row-count delta from one insertMany() call. */
interface RollupDelta {
  bucket: Date;
  tenant_id: string;
  service: string;
  level: string;
  count: number;
}

@Injectable()
export class LogRepository implements LogRepositoryContract {
  constructor(
    // Single connection, shared by the ingestion path below and by
    // findPage()/aggregate() — see src/config/database.config.ts.
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Log)
    private readonly readRepository: Repository<Log>,
    @InjectRepository(LogRollup)
    private readonly rollupReadRepository: Repository<LogRollup>,
  ) {}

  /**
   * Inserts and rolls up one caller's batch inside a single transaction —
   * `dataSource.transaction()` checks out a connection, begins, commits once
   * the callback resolves, and rolls back (then re-throws) if it rejects, so
   * the two tables can never drift out of sync after a crash.
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
   * Groups the batch just written by (tenant_id, service, level,
   * minute-bucket) in application code — no extra query, the rows are
   * already in memory — and issues one multi-row upsert covering every
   * distinct group the batch touched.
   *
   * Goes through `manager.query()` rather than `manager.getRepository(LogRollup)`'s
   * QueryBuilder `.orUpdate()` because this TypeORM version's `.orUpdate()`
   * can only generate `SET col = EXCLUDED.col` (a plain overwrite) for a
   * list of columns — it has no way to express the relative-delta
   * `count = log_rollups.count + EXCLUDED.count` this upsert needs. A
   * snapshot-read-then-write overwrite would reintroduce exactly the race
   * under concurrent `insertMany()` calls that the relative delta exists to
   * avoid, so this one statement stays raw SQL — still issued through the
   * ORM's transactional `manager`, on the same connection/transaction as
   * `insertLogsIn()` in `insertMany()`, not a separate raw `pg` connection.
   */
  private async upsertRollups(
    manager: EntityManager,
    logs: readonly NewLog[],
  ): Promise<void> {
    const deltas = this.groupIntoRollupDeltas(logs);
    const values: unknown[] = [];
    const rows = deltas.map((delta, index) => {
      const offset = index * 5;
      values.push(
        delta.bucket,
        delta.tenant_id,
        delta.service,
        delta.level,
        delta.count,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });

    await manager.query(
      `
        INSERT INTO log_rollups (bucket, tenant_id, service, level, count)
        VALUES ${rows.join(', ')}
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
      this.readRepository,
      query,
    ).getRawMany<RawLogRow>();
    const hasMore = logs.length > query.limit;

    return {
      logs: hasMore ? logs.slice(0, query.limit) : logs,
      hasMore,
    };
  }

  /**
   * A request with a `q`/`attr.*` filter is served by a full raw scan,
   * unchanged (FR-006). Otherwise, reads `log_rollups` for the minute-
   * aligned bulk of `[since, until)` and raw-scans `logs` only for the (at
   * most two) partial-minute edges, then sums the two result sets — output
   * numerically identical to a full raw scan (research.md Decision 7).
   */
  async aggregate(query: AggregateLogsQuery): Promise<LogAggregation[]> {
    if (!isRollupEligible(query)) {
      return this.mergeAggregationRows(
        await this.aggregateRawScan(query, query.since, query.until),
      );
    }

    const rollupSince = alignUpToRollupBucket(query.since);
    const rollupUntil = alignDownToRollupBucket(query.until);
    const rows: RawLogAggregation[] = [];

    if (rollupSince < rollupUntil) {
      const rollupRows = await buildRollupAggregationQuery(
        this.rollupReadRepository,
        query,
        rollupSince,
        rollupUntil,
      ).getRawMany<RawLogAggregation>();
      rows.push(...rollupRows);
    }

    if (query.since < rollupSince) {
      rows.push(
        ...(await this.aggregateRawScan(query, query.since, rollupSince)),
      );
    }

    if (rollupUntil < query.until) {
      rows.push(
        ...(await this.aggregateRawScan(query, rollupUntil, query.until)),
      );
    }

    return this.mergeAggregationRows(rows);
  }

  private async aggregateRawScan(
    query: AggregateLogsQuery,
    since: Date,
    until: Date,
  ): Promise<RawLogAggregation[]> {
    return buildAggregationQuery(this.readRepository, {
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

  /**
   * Streams the batch into `logs` via PostgreSQL's `COPY ... FROM STDIN`
   * (CSV format, through `pg-copy-streams`) instead of a parameterized
   * multi-row `INSERT` — materially cheaper for the row counts this hot
   * path pushes through under the project's 0.5-CPU/256MB app container
   * limit. `manager.queryRunner.connect()` returns the raw `pg` client
   * already checked out for this transactional `EntityManager` (not a
   * fresh one from the pool), so the COPY runs on the exact same
   * connection/transaction as `upsertRollups()` in `insertMany()` — a
   * rollback still undoes both.
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

  /** Builds one CSV row per log, in the exact column order `insertLogsIn()`'s COPY declares. */
  private buildLogsCsv(logs: readonly NewLog[]): string {
    const rows = logs.map((log) =>
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

    return rows.join('\n') + '\n';
  }

  /** Quotes a CSV field and doubles embedded quotes only when RFC 4180 requires it. */
  private escapeCsvField(value: string): string {
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }
}
