import type { SelectQueryBuilder } from 'typeorm';

import type { Log } from '@/logs/entities/log.entity';
import type { LogFilters } from '@/logs/interfaces/log-query.interface';

export function applyLogFilters(
  queryBuilder: SelectQueryBuilder<Log>,
  filters: LogFilters,
): SelectQueryBuilder<Log> {
  // Unconditional — every query is scoped to exactly one tenant, never
  // optional. See specs/001-multi-tenancy/research.md Decisions 6 and 8:
  // this single predicate is also what makes cross-tenant cursor reuse safe
  // with no cursor format change, since it narrows every other filter too.
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

/**
 * `attr.<key>=<value>` equality, "compared as strings" per
 * docs/Final_Project.md, against a stored `attributes` value that may
 * itself be a JSON string, number, or boolean — replicates that behavior
 * as a type-branched containment check directly against `attributes`
 * (data-model.md's "Log (existing entity, changed)" note) instead of a
 * write-time-stringified mirror column. Every `jsonb_build_object(...)`
 * argument gets an explicit `::text`/`::numeric`/`::boolean` cast — without
 * one, Postgres can't infer a type for a prepared-statement parameter to
 * this variadic function, which fails at bind time (research.md Decision
 * 12 / the comparison report's Recommendation 5 note). The numeric/boolean
 * branches are only emitted when `value` actually parses as one — binding
 * a non-numeric string with a `::numeric` cast errors regardless of any
 * surrounding boolean guard, since the cast applies to the parameter value
 * itself, not conditionally to a branch.
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

/** Only a canonical round-trip representation counts — "007" or "3.0" must not match the number 7 or 3. */
function parseCanonicalNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value
    ? parsed
    : undefined;
}
