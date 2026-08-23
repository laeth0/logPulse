import type { AttributeFilterRow } from './filter.types'
import type { LogLevel } from './log.types'

export type AggregationBucketSize = '1m' | '5m' | '1h' | '1d'
export type AggregationGroupBy = 'service' | 'level' | ''

export interface AggregateFiltersState {
  service: string
  level: LogLevel | ''
  since: string
  until: string
  q: string
  bucket: AggregationBucketSize
  groupBy: AggregationGroupBy
  attributes: AttributeFilterRow[]
}

export interface AggregateBucketPoint {
  start: string
  group: string | null
  count: number
}

export interface AggregateLogsResponse {
  buckets: AggregateBucketPoint[]
}

export type AggregateStatus = 'idle' | 'loading' | 'success' | 'error'

export interface UseAggregateLogsResult {
  status: AggregateStatus
  buckets: AggregateBucketPoint[]
  error: string | null
  aggregate: (filters: AggregateFiltersState, apiKey: string) => Promise<void>
  reset: () => void
}
