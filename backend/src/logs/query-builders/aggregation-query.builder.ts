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

export function isRollupEligible(query: AggregateLogsQuery): boolean {
  return (
    query.q === undefined &&
    (query.attributes === undefined ||
      Object.keys(query.attributes).length === 0)
  );
}

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
