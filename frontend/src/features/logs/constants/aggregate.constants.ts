import type { AggregationBucketSize, AggregationGroupBy } from '../types/aggregate.types'

export const BUCKET_SIZE_OPTIONS: { value: AggregationBucketSize; label: string }[] = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
]

export const GROUP_BY_OPTIONS: { value: AggregationGroupBy; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'service', label: 'Service' },
  { value: 'level', label: 'Level' },
]

export const DEFAULT_AGGREGATION_RANGE_MS = 60 * 60 * 1000
