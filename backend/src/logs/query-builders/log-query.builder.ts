import type { Repository, SelectQueryBuilder } from 'typeorm';

import type { Log } from '@/logs/entities/log.entity';
import type { FindLogsQuery } from '@/logs/interfaces/log-query.interface';
import { applyLogFilters } from '@/logs/query-builders/log-filter.builder';

/**
 * Builds a TypeORM query to retrieve a paginated window of logs with filters and keyset cursor support.
 * Selects `limit + 1` rows to determine whether more records exist for subsequent pagination.
 *
 * @param repository - The TypeORM Log repository.
 * @param query - The find logs query parameters including filters, limit, and optional cursor.
 * @returns A SelectQueryBuilder configured for keyset-paginated log queries.
 */
export function buildLogPageQuery(
  repository: Repository<Log>,
  query: FindLogsQuery,
): SelectQueryBuilder<Log> {
  const queryBuilder = applyLogFilters(
    repository.createQueryBuilder('log'),
    query,
  )
    .select('log.id', 'id')
    .addSelect('log.timestamp', 'timestamp')
    .addSelect('log.level', 'level')
    .addSelect('log.service', 'service')
    .addSelect('log.message', 'message')
    .addSelect('log.attributes', 'attributes')
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
