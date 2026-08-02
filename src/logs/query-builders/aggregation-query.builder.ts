import type { Repository, SelectQueryBuilder } from 'typeorm';

import {
  LOG_AGGREGATION_BUCKET_INTERVALS,
  LOG_AGGREGATION_GROUP_COLUMNS,
  LOG_AGGREGATION_ORIGIN,
} from '@/common/constants/log-query.constants';
import type { Log } from '@/logs/entities/log.entity';
import type { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import type { AggregateLogsQuery } from '@/logs/interfaces/log-query.interface';
import { applyLogFilters } from '@/logs/query-builders/log-filter.builder';

export function buildAggregationQuery(
  repository: Repository<Log>,
  query: AggregateLogsQuery,
): SelectQueryBuilder<Log> {
  const bucketExpression = createBucketExpression();
  const groupExpression = createGroupExpression(query.groupBy);
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

function createBucketExpression(): string {
  return `date_bin(CAST(:bucketInterval AS interval), log.timestamp, ${LOG_AGGREGATION_ORIGIN})`;
}

function createGroupExpression(groupBy?: AggregationGroup): string {
  if (!groupBy) {
    return 'NULL';
  }

  return `log.${LOG_AGGREGATION_GROUP_COLUMNS[groupBy]}`;
}
