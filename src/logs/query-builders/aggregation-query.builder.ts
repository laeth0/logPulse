import type { Repository, SelectQueryBuilder } from 'typeorm';

import {
  LOG_AGGREGATION_BUCKET_INTERVALS,
  LOG_AGGREGATION_GROUP_COLUMNS,
  LOG_AGGREGATION_ORIGIN,
} from '@/common/constants/log-query.constants';
import type { LogRollup } from '@/logs/entities/log-rollup.entity';
import type { Log } from '@/logs/entities/log.entity';
import type { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import type { AggregateLogsQuery } from '@/logs/interfaces/log-query.interface';
import { applyLogFilters } from '@/logs/query-builders/log-filter.builder';

export function buildAggregationQuery(
  repository: Repository<Log>,
  query: AggregateLogsQuery,
): SelectQueryBuilder<Log> {
  const bucketExpression = createBucketExpression('log');
  const groupExpression = createGroupExpression(query.groupBy, 'log');
  const queryBuilder = applyLogFilters(
    repository.createQueryBuilder('log'),
    query,
  )
    .select(bucketExpression, 'start')
    .addSelect(groupExpression, 'group')
    .addSelect('COUNT(*)', 'count')
    .setParameter(
      'bucketInterval',
      LOG_AGGREGATION_BUCKET_INTERVALS[query.bucket],
    )
    .groupBy(bucketExpression)
    .orderBy(bucketExpression, 'ASC');

  if (query.groupBy) {
    queryBuilder.addGroupBy(groupExpression);
  }

  return queryBuilder;
}

/**
 * True when the request can be answered (wholly or in part) from
 * `log_rollups` — a `q`/`attr.*` filter needs per-message or per-attribute
 * detail no rollup carries, so those requests must bypass this path
 * entirely and be served by a full raw scan, unchanged (research.md
 * Decision 7; FR-006).
 */
export function isRollupEligible(query: AggregateLogsQuery): boolean {
  return (
    query.q === undefined &&
    (query.attributes === undefined ||
      Object.keys(query.attributes).length === 0)
  );
}

/**
 * Reads `log_rollups` for `[rollupSince, rollupUntil)` — the caller is
 * responsible for aligning both to whole rollup-bucket (minute) boundaries
 * first (see `alignUpToRollupBucket`/`alignDownToRollupBucket`), so every
 * row this query sums represents a fully in-range minute.
 */
export function buildRollupAggregationQuery(
  repository: Repository<LogRollup>,
  query: AggregateLogsQuery,
  rollupSince: Date,
  rollupUntil: Date,
): SelectQueryBuilder<LogRollup> {
  const bucketExpression = createBucketExpression('rollup');
  const groupExpression = createGroupExpression(query.groupBy, 'rollup');
  const queryBuilder = repository
    .createQueryBuilder('rollup')
    // Unconditional, same discipline as applyLogFilters()'s first predicate
    // against `logs` — a correct rollup PK alone doesn't stop a query from
    // summing another tenant's rows (research.md Decision 7, "H3" fix).
    .where('rollup.tenant_id = :tenantId', { tenantId: query.tenantId })
    .andWhere('rollup.bucket >= :rollupSince', { rollupSince })
    .andWhere('rollup.bucket < :rollupUntil', { rollupUntil })
    .select(bucketExpression, 'start')
    .addSelect(groupExpression, 'group')
    .addSelect('SUM(rollup.count)', 'count')
    .setParameter(
      'bucketInterval',
      LOG_AGGREGATION_BUCKET_INTERVALS[query.bucket],
    )
    .groupBy(bucketExpression)
    .orderBy(bucketExpression, 'ASC');

  if (query.service !== undefined) {
    queryBuilder.andWhere('rollup.service = :service', {
      service: query.service,
    });
  }

  if (query.level !== undefined) {
    queryBuilder.andWhere('rollup.level = :level', { level: query.level });
  }

  if (query.groupBy) {
    queryBuilder.addGroupBy(groupExpression);
  }

  return queryBuilder;
}

function createBucketExpression(alias: string): string {
  return `date_bin(CAST(:bucketInterval AS interval), ${alias}.${alias === 'rollup' ? 'bucket' : 'timestamp'}, ${LOG_AGGREGATION_ORIGIN})`;
}

function createGroupExpression(
  groupBy: AggregationGroup | undefined,
  alias: string,
): string {
  if (!groupBy) {
    return 'NULL';
  }

  return `${alias}.${LOG_AGGREGATION_GROUP_COLUMNS[groupBy]}`;
}
