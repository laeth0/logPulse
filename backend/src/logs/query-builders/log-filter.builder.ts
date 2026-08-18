import type { SelectQueryBuilder } from 'typeorm';

import type { Log } from '@/logs/entities/log.entity';
import type { LogFilters } from '@/logs/interfaces/log-query.interface';

export function applyLogFilters(
  queryBuilder: SelectQueryBuilder<Log>,
  filters: LogFilters,
): SelectQueryBuilder<Log> {
  queryBuilder.andWhere(`log.tenant_id = :tenantId`, {
    tenantId: filters.tenantId,
  });

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

  if (filters.attributes) {
    Object.entries(filters.attributes).forEach(([key, value], index) => {
      const { sql, params } = buildAttributeEqualityClause(
        key,
        value,
        `attr${index}`,
      );
      queryBuilder.andWhere(sql, params);
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

function buildAttributeEqualityClause(
  key: string,
  value: string,
  paramPrefix: string,
): { sql: string; params: Record<string, unknown> } {
  const keyParam = `${paramPrefix}Key`;
  const params: Record<string, unknown> = { [keyParam]: key };
  const clauses = [
    `log.attributes @> jsonb_build_object(:${keyParam}::text, :${paramPrefix}String::text)`,
  ];
  params[`${paramPrefix}String`] = value;

  const numericValue = parseCanonicalNumber(value);
  if (numericValue !== undefined) {
    clauses.push(
      `log.attributes @> jsonb_build_object(:${keyParam}::text, :${paramPrefix}Numeric::numeric)`,
    );
    params[`${paramPrefix}Numeric`] = numericValue;
  }

  if (value === 'true' || value === 'false') {
    clauses.push(
      `log.attributes @> jsonb_build_object(:${keyParam}::text, :${paramPrefix}Boolean::boolean)`,
    );
    params[`${paramPrefix}Boolean`] = value === 'true';
  }

  return { sql: `(${clauses.join(' OR ')})`, params };
}

function parseCanonicalNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value
    ? parsed
    : undefined;
}
