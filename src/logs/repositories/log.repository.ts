import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { PoolClient } from 'pg';
import { from as copyFromStdin } from 'pg-copy-streams';
import type { DataSource, Repository } from 'typeorm';

import { Log } from '@/logs/entities/log.entity';
import type {
  AggregateLogsQuery,
  FindLogsQuery,
  LogAggregation,
  LogPage,
  RawLogAggregation,
} from '@/logs/interfaces/log-query.interface';
import type {
  LogRepositoryContract,
  NewLog,
} from '@/logs/interfaces/log-repository.interface';
import { encodeLogsAsCsv } from '@/logs/repositories/log-csv-encoder';
import { buildAggregationQuery } from '@/logs/query-builders/aggregation-query.builder';
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

@Injectable()
export class LogRepository implements LogRepositoryContract {
  constructor(
    // Default connection: used only for the raw COPY ingestion path below,
    // so ingestion and reads never contend for the same connection pool.
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // Dedicated read-pool connection for findPage()/aggregate() — see
    // createReadDatabaseOptions() in src/config/database.config.ts.
    @InjectRepository(Log, 'read')
    private readonly readRepository: Repository<Log>,
  ) {}

  async insertMany(logs: readonly NewLog[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    const [connection, release] = await this.obtainRawConnection();

    try {
      await this.copyLogsIn(connection, logs);
    } finally {
      release();
    }
  }

  async findPage(query: FindLogsQuery): Promise<LogPage> {
    const logs = await buildLogPageQuery(this.readRepository, query).getMany();
    const hasMore = logs.length > query.limit;

    return {
      logs: hasMore ? logs.slice(0, query.limit) : logs,
      hasMore,
    };
  }

  async aggregate(query: AggregateLogsQuery): Promise<LogAggregation[]> {
    const rows = await buildAggregationQuery(
      this.readRepository,
      query,
    ).getRawMany<RawLogAggregation>();

    return rows.map((row) => ({
      start: row.start,
      group: row.group,
      count: Number(row.count),
    }));
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
          level,
          service,
          message,
          attributes,
          attributes_text
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
