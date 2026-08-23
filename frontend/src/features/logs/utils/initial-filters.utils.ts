import { DEFAULT_AGGREGATION_RANGE_MS } from '../constants/aggregate.constants'
import { DEFAULT_QUERY_LIMIT } from '../constants/query.constants'
import type { AggregateFiltersState } from '../types/aggregate.types'
import type { QueryFiltersState } from '../types/query.types'
import { defaultAggregationRange } from './datetime.utils'

export function createInitialQueryFilters(): QueryFiltersState {
  return {
    service: '',
    level: '',
    since: '',
    until: '',
    q: '',
    limit: DEFAULT_QUERY_LIMIT,
    attributes: [],
  }
}

export function createInitialAggregateFilters(): AggregateFiltersState {
  const { since, until } = defaultAggregationRange(DEFAULT_AGGREGATION_RANGE_MS)

  return {
    service: '',
    level: '',
    since,
    until,
    q: '',
    bucket: '1m',
    groupBy: '',
    attributes: [],
  }
}
