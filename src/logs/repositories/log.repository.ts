import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

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
import { buildAggregationQuery } from '@/logs/query-builders/aggregation-query.builder';
import { buildLogPageQuery } from '@/logs/query-builders/log-query.builder';

@Injectable()
export class LogRepository implements LogRepositoryContract {
  constructor(
    @InjectRepository(Log)
    private readonly repository: Repository<Log>,
  ) {}

  async insertMany(logs: readonly NewLog[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    const entities = logs.map((log) => Object.assign(new Log(), log));
    await this.repository.insert(entities);
  }

  async findPage(query: FindLogsQuery): Promise<LogPage> {
    const logs = await buildLogPageQuery(this.repository, query).getMany();
    const hasMore = logs.length > query.limit;

    return {
      logs: hasMore ? logs.slice(0, query.limit) : logs,
      hasMore,
    };
  }

  async aggregate(query: AggregateLogsQuery): Promise<LogAggregation[]> {
    const rows = await buildAggregationQuery(
      this.repository,
      query,
    ).getRawMany<RawLogAggregation>();

    return rows.map((row) => ({
      start: row.start,
      group: row.group,
      count: Number(row.count),
    }));
  }
}
