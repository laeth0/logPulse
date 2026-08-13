import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { PoolClient } from 'pg';
import { from as copyFromStdin } from 'pg-copy-streams';
import type { DataSource, Repository } from 'typeorm';

import {
  DEFAULT_INGEST_COALESCE_MAX_ROWS,
  DEFAULT_INGEST_COALESCE_WINDOW_MS,
} from '@/common/constants/log-api.constants';
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
import { encodeLogsAsCsv } from '@/logs/repositories/log-csv-encoder';
import {
  buildAggregationQuery,
  buildRollupAggregationQuery,
  isRollupEligible,
} from '@/logs/query-builders/aggregation-query.builder';
import { buildLogPageQuery } from '@/logs/query-builders/log-query.builder';

/**
 * Minimal shape of the internal replication API that TypeORM's Postgres
 * driver exposes for checking a raw `pg` connection out of its pool. Typed
 * locally rather than importing `typeorm/driver/postgres/PostgresDriver`
 * because that module is an internal implementation path, not part of
 * TypeORM's public API surface.
 */
interface PostgresConnectionProvider {
  obtainMasterConnection(): Promise<[PoolClient, () => void]>;
}

/**
 * One caller's still-pending insertMany() call: its rows plus the settlers
 * for the Promise that call is waiting on. A caller's own rows are always
 * flushed together in a single COPY — see takeBatch() (research.md Decision 1).
 */
interface PendingInsert {
  logs: readonly NewLog[];
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** One (bucket, tenant_id, service, level) group's row-count delta from a single flush. */
interface RollupDelta {
  bucket: Date;
  tenant_id: string;
  service: string;
  level: string;
  count: number;
}

@Injectable()
export class LogRepository implements LogRepositoryContract {
  private readonly coalesceWindowMs = process.env.INGEST_COALESCE_WINDOW_MS
    ? Number(process.env.INGEST_COALESCE_WINDOW_MS)
    : DEFAULT_INGEST_COALESCE_WINDOW_MS;

  private readonly coalesceMaxRows = process.env.INGEST_COALESCE_MAX_ROWS
    ? Number(process.env.INGEST_COALESCE_MAX_ROWS)
    : DEFAULT_INGEST_COALESCE_MAX_ROWS;

  private readonly pendingInserts: PendingInsert[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(
    // Default connection: used only for the raw COPY ingestion path below,
    // so ingestion and reads never contend for the same connection pool.
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // Dedicated read-pool connection for findPage()/aggregate() — see
    // createReadDatabaseOptions() in src/config/database.config.ts.
    @InjectRepository(Log, 'read')
    private readonly readRepository: Repository<Log>,
    @InjectRepository(LogRollup, 'read')
    private readonly rollupReadRepository: Repository<LogRollup>,
  ) {}

  insertMany(logs: readonly NewLog[]): Promise<void> {
    if (logs.length === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.pendingInserts.push({ logs, resolve, reject });
      this.scheduleFlush();
    });
  }

  private scheduleFlush(): void {
    if (this.isFlushing || this.flushTimer !== null) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.runFlushLoop();
    }, this.coalesceWindowMs);
  }

  /**
   * Drains the pending queue batch by batch until empty. Runs as a loop
   * rather than one capped flush so that arrivals which outpace a single
   * flush's capacity are absorbed immediately, without waiting for another
   * debounce window (research.md Decision 1, "H1" fix). The isFlushing
   * guard makes a timer firing mid-loop a no-op: the running loop will pick
   * up anything queued since it started.
   */
  private async runFlushLoop(): Promise<void> {
    if (this.isFlushing) {
      return;
    }

    this.isFlushing = true;

    try {
      while (this.pendingInserts.length > 0) {
        const batch = this.takeBatch();
        await this.flushBatch(batch);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Builds one batch from the front of the queue, adding whole callers
   * until the next caller would push the running total past the row cap.
   * The first caller taken is always included whole even if its own batch
   * alone exceeds the cap — a caller's rows are never split across two
   * flushes to stay under it ("F1" fix, research.md Decision 1).
   */
  private takeBatch(): PendingInsert[] {
    const batch: PendingInsert[] = [];
    let rowCount = 0;

    while (this.pendingInserts.length > 0) {
      const next = this.pendingInserts[0];

      if (
        batch.length > 0 &&
        rowCount + next.logs.length > this.coalesceMaxRows
      ) {
        break;
      }

      batch.push(next);
      rowCount += next.logs.length;
      this.pendingInserts.shift();
    }

    return batch;
  }

  /**
   * Settles every caller in this batch only after their combined rows have
   * actually finished a single COPY — resolved together on success,
   * rejected together (with the underlying error) on failure. No caller's
   * promise can resolve before its own rows are durably committed (FR-002).
   *
   * The COPY and the rollup upsert run inside one explicit transaction on
   * the same connection — BEGIN before COPY, COMMIT only after the rollup
   * INSERT also succeeds — so the two tables can never drift out of sync
   * after a crash (research.md Decision 6, "C1" fix).
   */
  private async flushBatch(batch: PendingInsert[]): Promise<void> {
    const logs = batch.flatMap((entry) => entry.logs);
    const [connection, release] = await this.obtainRawConnection();

    try {
      await connection.query('BEGIN');
      await this.copyLogsIn(connection, logs);
      await this.upsertRollups(connection, logs);
      await connection.query('COMMIT');

      for (const entry of batch) {
        entry.resolve();
      }
    } catch (error) {
      await connection.query('ROLLBACK').catch(() => undefined);

      for (const entry of batch) {
        entry.reject(error);
      }
    } finally {
      release();
    }
  }

  /**
   * Groups the batch just written by (tenant_id, service, level,
   * minute-bucket) in application code — no extra query, the rows are
   * already in memory — and issues one multi-row upsert covering every
   * distinct group the flush touched (research.md Decision 6).
   */
  private async upsertRollups(
    connection: PoolClient,
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

    await connection.query(
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

  private async obtainRawConnection(): Promise<[PoolClient, () => void]> {
    const provider = this.dataSource
      .driver as unknown as PostgresConnectionProvider;
    return provider.obtainMasterConnection();
  }

  private async copyLogsIn(
    connection: PoolClient,
    logs: readonly NewLog[],
  ): Promise<void> {
    const copyStream = connection.query(
      copyFromStdin(`
        COPY logs (
          timestamp,
          tenant_id,
          level,
          service,
          message,
          attributes
        ) FROM STDIN WITH (FORMAT csv)
      `),
    );

    await new Promise<void>((resolve, reject) => {
      copyStream.on('error', reject);
      copyStream.on('finish', resolve);
      copyStream.end(encodeLogsAsCsv(logs), 'utf8');
    });
  }
}
