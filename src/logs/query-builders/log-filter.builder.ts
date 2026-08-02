import type { SelectQueryBuilder } from 'typeorm';

import type { Log } from '@/logs/entities/log.entity';
import type { LogFilters } from '@/logs/interfaces/log-query.interface';

export function applyLogFilters(
  queryBuilder: SelectQueryBuilder<Log>,
  filters: LogFilters,
): SelectQueryBuilder<Log> {
  if (filters.service !== undefined) {
    queryBuilder.andWhere(`log.service = :service`, {
      service: filters.service,
    });
  }

  if (filters.level !== undefined) {
    queryBuilder.andWhere(`log.level = :level`, {
      level: filters.level,
    });
  }

  if (filters.since !== undefined) {
    queryBuilder.andWhere(`log.timestamp >= :since`, {
      since: filters.since,
    });
  }

  if (filters.until !== undefined) {
    queryBuilder.andWhere(`log.timestamp < :until`, {
      until: filters.until,
    });
  }

  if (filters.attributes && Object.keys(filters.attributes).length > 0) {
    queryBuilder.andWhere(`log.attributes_text @> CAST(:attributes AS jsonb)`, {
      attributes: JSON.stringify(filters.attributes),
    });
  }

  if (filters.q !== undefined) {
    queryBuilder.andWhere(`log.message ILIKE :messageQuery ESCAPE '\\'`, {
      messageQuery: `%${escapeLikePattern(filters.q)}%`,
    });
  }

  return queryBuilder;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
