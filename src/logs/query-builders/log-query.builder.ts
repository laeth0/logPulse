import type { Repository, SelectQueryBuilder } from 'typeorm';

import type { Log } from '@/logs/entities/log.entity';
import type { FindLogsQuery } from '@/logs/interfaces/log-query.interface';
import { applyLogFilters } from '@/logs/query-builders/log-filter.builder';

export function buildLogPageQuery(
  repository: Repository<Log>,
  query: FindLogsQuery,
): SelectQueryBuilder<Log> {
  const queryBuilder = applyLogFilters(
    repository.createQueryBuilder('log'),
    query,
  )
    .orderBy(`log.timestamp`, 'DESC')
    .addOrderBy(`log.id`, 'DESC')
    .take(query.limit + 1);

  if (query.cursor) {
    queryBuilder.andWhere(
      `(log.timestamp, log.id) < (:cursorTimestamp, :cursorId)`,
      {
        cursorTimestamp: query.cursor.timestamp,
        cursorId: query.cursor.id,
      },
    );
  }

  return queryBuilder;
}
