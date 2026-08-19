import type { SelectQueryBuilder } from 'typeorm';

import type { Log } from '@/logs/entities/log.entity';
import type { LogFilters } from '@/logs/interfaces/log-query.interface';

/**
 * Applies common log query filters (tenant, service, level, date range, attributes, and text search) to a TypeORM SelectQueryBuilder.
 *
 * @param queryBuilder - The SelectQueryBuilder instance targeting the `log` entity.
 * @param filters - The filter criteria to apply.
 * @returns The modified SelectQueryBuilder with WHERE clauses attached.
 */
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

/**
 * Escapes special wildcard characters (`\`, `%`, `_`) in ILIKE search patterns.
 *
 * @param value - Raw text query string.
 * @returns Safely escaped string for use in SQL ILIKE clauses.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Builds a JSONB containment query clause (`@>`) supporting string, numeric, and boolean types.
 *
 * @param key - The attribute key to match.
 * @param value - The raw string value to match against.
 * @param paramPrefix - Unique parameter prefix to prevent collision.
 * @returns Object containing the SQL clause string and bound parameters map.
 */
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

/**
 * Parses a string to a finite number if and only if the string representation is canonical.
 *
 * @param value - String value to parse.
 * @returns Parsed number or `undefined` if non-numeric or non-canonical.
 */
function parseCanonicalNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value
    ? parsed
    : undefined;
}
